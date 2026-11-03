using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

// Diagramme für C#: Klassen (Klassendiagramm) und Methoden/Hauptprogramm (Struktogramme) im Format von
// @klonk/diagrams (`Outline`). Oberklasse und Schnittstellen kommen aus dem Semantikmodell (in C# stehen beide in derselben Liste).
// Hinweis: JsonArray.Add nur mit JsonNode (die generische Variante braucht Reflection, im getrimmten Host nicht da).
// JSON bewusst mit einfachen Zuweisungen bauen – viele Tupel-Literale mit impliziten JsonNode-Konvertierungen
// ließen Roslyn beim Übersetzen dieses Hosts minutenlang rechnen.
public static partial class Host
{
    const int MaxText = 70;

    [JSExport]
    public static string Outline(string source, string[] files)
    {
        var (tree, model) = Analyze(source, files);
        return new OutlineBuilder(tree.GetRoot(), model).Build();
    }

    sealed class OutlineBuilder(SyntaxNode root, SemanticModel model)
    {
        // Eigene Methoden ⇒ Aufrufe erscheinen im Struktogramm als Unterprogrammaufruf
        readonly HashSet<string> own = root.DescendantNodes().OfType<MethodDeclarationSyntax>().Select(m => m.Identifier.Text)
            .Concat(root.DescendantNodes().OfType<LocalFunctionStatementSyntax>().Select(f => f.Identifier.Text)).ToHashSet();

        public string Build()
        {
            var classes = new JsonArray();
            var methodRoutines = new List<JsonObject>();
            foreach (var type in root.DescendantNodes().OfType<BaseTypeDeclarationSyntax>()) classes.Add(TypeOf(type, methodRoutines));

            var routines = new JsonArray();
            // Hauptprogramm aus Anweisungen auf oberster Ebene, lokale Funktionen als eigene Struktogramme
            var main = new JsonArray();
            var mainLine = 0;
            foreach (var global in root.ChildNodes().OfType<GlobalStatementSyntax>())
            {
                if (global.Statement is LocalFunctionStatementSyntax) continue;
                if (mainLine == 0) mainLine = Line(global);
                Add(main, Statements(global.Statement));
            }
            if (main.Count > 0) routines.Add(Routine("main", "main", "", "", null, mainLine, main));
            foreach (var fn in root.DescendantNodes().OfType<LocalFunctionStatementSyntax>())
            {
                var line = Line(fn);
                var body = fn.Body is not null ? Statements(fn.Body) : new List<JsonObject> { Exit("return " + fn.ExpressionBody!.Expression, line) };
                routines.Add(Routine($"{fn.Identifier.Text}:{line}", "function", fn.Identifier.Text, Signature(fn.Identifier.Text, fn.ParameterList, Text(fn.ReturnType)), null, line, ToArray(body)));
            }
            foreach (var routine in methodRoutines) routines.Add(routine);

            var result = new JsonObject();
            result["routines"] = routines;
            result["classes"] = classes;
            return result.ToJsonString();
        }

        JsonObject TypeOf(BaseTypeDeclarationSyntax type, List<JsonObject> routines)
        {
            var symbol = model.GetDeclaredSymbol(type) as INamedTypeSymbol;
            var name = type.Identifier.Text;
            var kind = type switch
            {
                InterfaceDeclarationSyntax => "interface",
                EnumDeclarationSyntax => "enum",
                RecordDeclarationSyntax => "record",
                StructDeclarationSyntax => "struct",
                _ => "class",
            };
            var defaultVisibility = kind == "interface" ? "public" : "private";
            var cls = new JsonObject();
            cls["name"] = name;
            cls["kind"] = kind;
            if (type.Modifiers.Any(SyntaxKind.AbstractKeyword)) cls["isAbstract"] = true;
            if (symbol?.ContainingNamespace is { IsGlobalNamespace: false } ns) cls["namespace"] = ns.ToDisplayString();
            cls["line"] = Line(type);

            var extends = new JsonArray();
            var implements = new JsonArray();
            if (symbol is not null)
            {
                var baseType = symbol.BaseType;
                if (kind != "interface" && baseType is not null && baseType.SpecialType is not (SpecialType.System_Object or SpecialType.System_ValueType or SpecialType.System_Enum))
                    extends.Add((JsonNode)baseType.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat));
                foreach (var iface in symbol.Interfaces)
                {
                    var display = iface.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat);
                    if (kind == "interface") extends.Add((JsonNode)display);
                    else implements.Add((JsonNode)display);
                }
            }
            cls["extends"] = extends;
            cls["implements"] = implements;

            var attributes = new JsonArray();
            var methods = new JsonArray();
            if (type is EnumDeclarationSyntax enumDeclaration)
            {
                var values = new JsonArray();
                foreach (var member in enumDeclaration.Members) values.Add((JsonNode)member.Identifier.Text);
                cls["enumValues"] = values;
            }
            if (type is RecordDeclarationSyntax { ParameterList: { } positional })
            {
                foreach (var p in positional.Parameters) attributes.Add(Attribute(p.Identifier.Text, p.Type is null ? null : Text(p.Type), "public", false, false, Line(p)));
            }
            if (type is TypeDeclarationSyntax typeDeclaration)
            {
                foreach (var member in typeDeclaration.Members)
                {
                    var line = Line(member);
                    switch (member)
                    {
                        case FieldDeclarationSyntax field:
                        {
                            var isConst = field.Modifiers.Any(SyntaxKind.ConstKeyword);
                            foreach (var v in field.Declaration.Variables)
                                attributes.Add(Attribute(v.Identifier.Text, Text(field.Declaration.Type), Visibility(field.Modifiers, defaultVisibility), isConst || field.Modifiers.Any(SyntaxKind.StaticKeyword), isConst || field.Modifiers.Any(SyntaxKind.ReadOnlyKeyword), line));
                            break;
                        }
                        case PropertyDeclarationSyntax property:
                            attributes.Add(Attribute(property.Identifier.Text, Text(property.Type), Visibility(property.Modifiers, defaultVisibility), property.Modifiers.Any(SyntaxKind.StaticKeyword), false, line));
                            break;
                        case MethodDeclarationSyntax method:
                        {
                            var returns = Text(method.ReturnType);
                            var isAbstract = method.Modifiers.Any(SyntaxKind.AbstractKeyword) || (kind == "interface" && method.Body is null && method.ExpressionBody is null);
                            methods.Add(Method(method.Identifier.Text, method.ParameterList, returns, Visibility(method.Modifiers, defaultVisibility), method.Modifiers.Any(SyntaxKind.StaticKeyword), isAbstract, false, line));
                            List<JsonObject>? body = null;
                            if (method.Body is not null) body = Statements(method.Body);
                            else if (method.ExpressionBody is not null) body = [Exit((returns == "void" ? "" : "return ") + method.ExpressionBody.Expression, line)];
                            if (body is not null)
                                routines.Add(Routine($"{name}.{method.Identifier.Text}:{line}", "method", method.Identifier.Text, Signature(method.Identifier.Text, method.ParameterList, returns), name, line, ToArray(body)));
                            break;
                        }
                        case ConstructorDeclarationSyntax ctor:
                            methods.Add(Method(ctor.Identifier.Text, ctor.ParameterList, null, Visibility(ctor.Modifiers, defaultVisibility), ctor.Modifiers.Any(SyntaxKind.StaticKeyword), false, true, line));
                            if (ctor.Body is not null)
                                routines.Add(Routine($"{name}.{ctor.Identifier.Text}:{line}", "constructor", ctor.Identifier.Text, Signature(ctor.Identifier.Text, ctor.ParameterList, null), name, line, ToArray(Statements(ctor.Body))));
                            break;
                    }
                }
            }
            cls["attributes"] = attributes;
            cls["methods"] = methods;
            return cls;
        }

        // ------------------------------------------------------------------
        // Struktogramme

        List<JsonObject> Statements(StatementSyntax? statement)
        {
            var result = new List<JsonObject>();
            if (statement is null) return result;
            if (statement is BlockSyntax block)
            {
                foreach (var inner in block.Statements) result.AddRange(Statements(inner));
                return result;
            }
            var line = Line(statement);
            switch (statement)
            {
                case EmptyStatementSyntax:
                case LocalFunctionStatementSyntax:
                    break;
                case IfStatementSyntax ifStatement:
                {
                    var node = Node("if", line);
                    node["condition"] = Text(ifStatement.Condition);
                    node["then"] = ToArray(Statements(ifStatement.Statement));
                    node["else"] = ToArray(Statements(ifStatement.Else?.Statement));
                    result.Add(node);
                    break;
                }
                case WhileStatementSyntax loop:
                {
                    var condition = Text(loop.Condition);
                    result.Add(Loop(condition == "true" ? "none" : "pre", $"while ({condition})", loop.Statement, line));
                    break;
                }
                case DoStatementSyntax loop:
                    result.Add(Loop("post", $"while ({Text(loop.Condition)})", loop.Statement, line));
                    break;
                case ForStatementSyntax loop:
                    result.Add(Loop("pre", Head(loop, loop.CloseParenToken), loop.Statement, line));
                    break;
                case CommonForEachStatementSyntax loop:
                    result.Add(Loop("pre", Head(loop, loop.CloseParenToken), loop.Statement, line));
                    break;
                case SwitchStatementSyntax switchStatement:
                    result.Add(Switch(switchStatement, line));
                    break;
                case TryStatementSyntax tryStatement:
                {
                    result.Add(Group("try", tryStatement.Block, line));
                    foreach (var c in tryStatement.Catches)
                        result.Add(Group(Compact("catch " + c.Declaration + (c.Filter is null ? "" : " " + c.Filter)), c.Block, Line(c)));
                    if (tryStatement.Finally is not null) result.Add(Group("finally", tryStatement.Finally.Block, Line(tryStatement.Finally)));
                    break;
                }
                case UsingStatementSyntax usingStatement:
                    result.Add(Group(Head(usingStatement, usingStatement.CloseParenToken), usingStatement.Statement, line));
                    break;
                case LockStatementSyntax lockStatement:
                    result.Add(Group(Head(lockStatement, lockStatement.CloseParenToken), lockStatement.Statement, line));
                    break;
                case LabeledStatementSyntax labeled:
                    result.AddRange(Statements(labeled.Statement));
                    break;
                case ReturnStatementSyntax or BreakStatementSyntax or ContinueStatementSyntax or ThrowStatementSyntax or YieldStatementSyntax or GotoStatementSyntax:
                    result.Add(Exit(Action(statement), line));
                    break;
                case ExpressionStatementSyntax { Expression: InvocationExpressionSyntax invocation }:
                {
                    var called = invocation.Expression switch
                    {
                        IdentifierNameSyntax id => id.Identifier.Text,
                        MemberAccessExpressionSyntax { Expression: ThisExpressionSyntax } access => access.Name.Identifier.Text,
                        _ => "",
                    };
                    var node = Node(own.Contains(called) ? "call" : "action", line);
                    node["text"] = Action(statement);
                    result.Add(node);
                    break;
                }
                default:
                {
                    var node = Node("action", line);
                    node["text"] = Action(statement);
                    result.Add(node);
                    break;
                }
            }
            return result;
        }

        JsonObject Switch(SwitchStatementSyntax switchStatement, int line)
        {
            var cases = new JsonArray();
            var sections = switchStatement.Sections.OrderBy(s => s.Labels.Any(l => l is DefaultSwitchLabelSyntax) ? 1 : 0);
            foreach (var section in sections)
            {
                var body = new List<JsonObject>();
                foreach (var statement in section.Statements) body.AddRange(Statements(statement));
                // `break` am Ende eines Falls gehört zur Fallauswahl
                if (body.Count > 0 && (string?)body[^1]["kind"] == "exit" && (string?)body[^1]["text"] == "break") body.RemoveAt(body.Count - 1);
                var labels = new List<string>();
                var isDefault = false;
                foreach (var label in section.Labels)
                {
                    if (label is DefaultSwitchLabelSyntax) isDefault = true;
                    else if (label is CaseSwitchLabelSyntax c) labels.Add(Text(c.Value));
                    else if (label is CasePatternSwitchLabelSyntax p) labels.Add(Text(p.Pattern) + (p.WhenClause is null ? "" : " " + Text(p.WhenClause)));
                }
                var entry = new JsonObject();
                entry["label"] = isDefault ? null : string.Join(", ", labels);
                entry["body"] = ToArray(body);
                cases.Add(entry);
            }
            var node = Node("switch", line);
            node["subject"] = Text(switchStatement.Expression);
            node["cases"] = cases;
            return node;
        }

        JsonObject Loop(string test, string header, StatementSyntax body, int line)
        {
            var node = Node("loop", line);
            node["test"] = test;
            node["header"] = header;
            node["body"] = ToArray(Statements(body));
            return node;
        }

        JsonObject Group(string header, StatementSyntax body, int line)
        {
            var node = Node("block", line);
            node["header"] = header;
            node["body"] = ToArray(Statements(body));
            return node;
        }

        static JsonObject Exit(string text, int line)
        {
            var node = Node("exit", line);
            node["text"] = Compact(text);
            return node;
        }

        static JsonObject Node(string kind, int line)
        {
            var node = new JsonObject();
            node["kind"] = kind;
            node["line"] = line;
            return node;
        }

        // ------------------------------------------------------------------
        // Klassen

        static JsonObject Attribute(string name, string? type, string visibility, bool isStatic, bool isFinal, int line)
        {
            var attribute = new JsonObject();
            attribute["name"] = name;
            if (type is not null) attribute["type"] = type;
            attribute["visibility"] = visibility;
            if (isStatic) attribute["isStatic"] = true;
            if (isFinal) attribute["isFinal"] = true;
            attribute["line"] = line;
            return attribute;
        }

        static JsonObject Method(string name, ParameterListSyntax parameters, string? returns, string visibility, bool isStatic, bool isAbstract, bool isConstructor, int line)
        {
            var method = new JsonObject();
            method["name"] = name;
            var list = new JsonArray();
            foreach (var p in parameters.Parameters)
            {
                var param = new JsonObject();
                param["name"] = p.Identifier.Text;
                if (p.Type is not null) param["type"] = Text(p.Type);
                list.Add(param);
            }
            method["params"] = list;
            if (returns is not null) method["returnType"] = returns;
            method["visibility"] = visibility;
            if (isStatic) method["isStatic"] = true;
            if (isAbstract) method["isAbstract"] = true;
            if (isConstructor) method["isConstructor"] = true;
            method["line"] = line;
            return method;
        }

        static JsonObject Routine(string id, string kind, string name, string signature, string? className, int line, JsonArray body)
        {
            var routine = new JsonObject();
            routine["id"] = id;
            routine["kind"] = kind;
            routine["name"] = name;
            routine["signature"] = signature;
            if (className is not null) routine["className"] = className;
            routine["line"] = line;
            routine["body"] = body;
            return routine;
        }

        static string Visibility(SyntaxTokenList modifiers, string fallback)
        {
            if (modifiers.Any(SyntaxKind.PublicKeyword)) return "public";
            if (modifiers.Any(SyntaxKind.PrivateKeyword)) return "private";
            if (modifiers.Any(SyntaxKind.ProtectedKeyword)) return "protected";
            return modifiers.Any(SyntaxKind.InternalKeyword) ? "package" : fallback;
        }

        static string Signature(string name, ParameterListSyntax? list, string? returns)
        {
            var parts = new List<string>();
            if (list is not null)
                foreach (var p in list.Parameters) parts.Add(p.Type is null ? p.Identifier.Text : p.Identifier.Text + ": " + Compact(p.Type.ToString()));
            return name + "(" + string.Join(", ", parts) + ")" + (returns is null ? "" : ": " + returns);
        }

        static void Add(JsonArray target, List<JsonObject> items)
        {
            foreach (var item in items) target.Add(item);
        }

        static JsonArray ToArray(List<JsonObject> items)
        {
            var array = new JsonArray();
            Add(array, items);
            return array;
        }

        static int Line(SyntaxNode node) => node.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
        static string Text(SyntaxNode? node) => node is null ? "" : Compact(node.ToString());

        /// <summary>Kopf einer Anweisung bis zur schließenden Klammer, z. B. <c>for (var i = 0; i &lt; 3; i++)</c></summary>
        static string Head(SyntaxNode node, SyntaxToken close) =>
            Compact(node.SyntaxTree.GetText().ToString(Microsoft.CodeAnalysis.Text.TextSpan.FromBounds(node.SpanStart, close.Span.End)));

        static string Action(StatementSyntax statement) => Compact(statement.ToString()).TrimEnd(';');

        static string Compact(string text)
        {
            var single = Regex.Replace(text, @"\s+", " ").Trim();
            return single.Length > MaxText ? single[..(MaxText - 1)].TrimEnd() + "…" : single;
        }
    }
}
