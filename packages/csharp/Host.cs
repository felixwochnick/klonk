using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;

// Host für C#-Programme im Worker: kompiliert mit Roslyn, setzt Prüfpunkte (wie bei JS/Java nur Einfügungen,
// Zeilen bleiben gleich) und führt das Programm synchron aus. Roboterbefehle gehen über JSImport an die
// JS-Roboter-API (packages/runtime/src/csharp/run.ts).
public static partial class Host
{
    public static void Main() { }

    [JSImport("call", "klonk")] internal static partial string JsCall(string name, string[] args);
    [JSImport("checkpoint", "klonk")] internal static partial bool JsCheckpoint(int line);
    [JSImport("variable", "klonk")] internal static partial void JsVariable(string name, string value);
    [JSImport("pause", "klonk")] internal static partial void JsPause();
    [JSImport("print", "klonk")] internal static partial void JsPrint(string text);

    const string UserFile = "Program.cs";
    // Wie implizite Usings im SDK, dazu die Roboter-API ohne Präfix
    const string GlobalUsings = "global using System; global using System.Collections.Generic; global using System.Linq; global using KlonkLib; global using static KlonkLib.Klonk;";

    static List<MetadataReference>? references;
    static SyntaxTree? robotTree;
    static SyntaxTree? usingsTree;
    static SyntaxTree[] libraries = [];

    /// <summary>Kompiliert und startet das Programm. Ergebnis als JSON: { ok } oder { error, line?, … }.</summary>
    [JSExport]
    public static string Run(string source, string[] files)
    {
        Prepare();
        AppDomain.CurrentDomain.SetData("klonk.call", new Func<string, string[], string>(JsCall));
        AppDomain.CurrentDomain.SetData("klonk.checkpoint", new Func<int, bool>(JsCheckpoint));
        AppDomain.CurrentDomain.SetData("klonk.variable", new Action<string, string>(JsVariable));
        AppDomain.CurrentDomain.SetData("klonk.pause", new Action(JsPause));

        // 1. Übersetzen (Fehler mit Zeilen des Originals)
        var parse = new CSharpParseOptions(LanguageVersion.Latest);
        var tree = CSharpSyntaxTree.ParseText(source, parse, UserFile);
        // Weitere .cs-Dateien des Projekts (nur mit Lizenz, entscheidet der Worker) – ohne Prüfpunkte
        libraries = files.Select((f, i) => CSharpSyntaxTree.ParseText(f, parse, $"Library{i}.cs")).ToArray();
        var compilation = Compile(tree);
        var errors = compilation.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToList();
        if (errors.Count > 0)
        {
            var first = errors.FirstOrDefault(d => d.Location.SourceTree == tree) ?? errors[0];
            var line = first.Location.SourceTree == tree ? first.Location.GetLineSpan().StartLinePosition.Line + 1 : 0;
            return Json(("error", "cs_compile"), ("message", first.GetMessage()), ("line", line));
        }

        // 2. Prüfpunkte einsetzen; scheitert das (sollte nicht), läuft das Programm ohne Debugger
        var instrumented = tree.WithChangedText(Instrument(tree, compilation.GetSemanticModel(tree)));
        var final = Compile(instrumented);
        var instrumentError = final.GetDiagnostics().FirstOrDefault(d => d.Severity == DiagnosticSeverity.Error);
        if (instrumentError is not null)
        {
            // Für die Fehlersuche in der Browser-Konsole (Worker) sichtbar
            Console.Error.WriteLine("Klonk: Prüfpunkte konnten nicht eingesetzt werden: " + instrumentError);
            final = compilation;
        }

        using var stream = new MemoryStream();
        var emit = final.Emit(stream);
        if (!emit.Success) return Json(("error", "cs_compile"), ("message", emit.Diagnostics.First(d => d.Severity == DiagnosticSeverity.Error).GetMessage()), ("line", 0));

        // 3. Ausführen
        var assembly = Assembly.Load(stream.ToArray());
        var entry = assembly.EntryPoint;
        if (entry is null) return Json(("error", "cs_no_main"));
        var writer = new LineWriter(JsPrint);
        Console.SetOut(writer);
        Console.SetError(writer);
        try
        {
            entry.Invoke(null, entry.GetParameters().Length == 0 ? null : new object[] { Array.Empty<string>() });
            writer.Flush();
            return Json(("ok", true));
        }
        catch (TargetInvocationException e) when (e.InnerException is not null)
        {
            writer.Flush();
            var inner = e.InnerException;
            // Fehler beim Initialisieren (z. B. in statischen Feldern) ⇒ eigentliche Ursache melden
            while (inner is TypeInitializationException { InnerException: not null }) inner = inner.InnerException;
            if (inner is JSException) return Json(("error", "js"), ("message", inner.Message));
            return Json(("error", "cs_runtime"), ("name", inner.GetType().Name), ("message", inner.Message));
        }
    }

    static CSharpCompilation Compile(SyntaxTree tree) =>
        CSharpCompilation.Create("Program", new[] { robotTree!, usingsTree!, tree }.Concat(libraries), references,
            // Ohne Threads (Single-Thread-WebAssembly): nicht parallel übersetzen
            new CSharpCompilationOptions(OutputKind.ConsoleApplication, optimizationLevel: OptimizationLevel.Debug, allowUnsafe: false, concurrentBuild: false));

    static void Prepare()
    {
        if (references is not null) return;
        var assembly = typeof(Host).Assembly;
        references = assembly.GetManifestResourceNames()
            .Where(n => n.StartsWith("ref/"))
            .Select(n =>
            {
                using var s = assembly.GetManifestResourceStream(n)!;
                return (MetadataReference)MetadataReference.CreateFromStream(s);
            })
            .ToList();
        using var robot = new StreamReader(assembly.GetManifestResourceStream("Robot.cs")!);
        robotTree = CSharpSyntaxTree.ParseText(robot.ReadToEnd(), new CSharpParseOptions(LanguageVersion.Latest), "Robot.cs");
        usingsTree = CSharpSyntaxTree.ParseText(GlobalUsings, new CSharpParseOptions(LanguageVersion.Latest), "Usings.cs");
    }

    /// <summary>
    /// Vor jede Anweisung: <c>if (KlonkLib.Klonk.__cp(zeile)) { KlonkLib.Klonk.__v("x", x); …; KlonkLib.Klonk.__pause(); }</c>.
    /// Rümpfe ohne Klammern (if/else/Schleifen) werden geklammert, Schleifenrümpfe bekommen einen Prüfpunkt je Durchlauf.
    /// Variablen: sicher zugewiesene lokale Variablen/Parameter der umgebenden Methode (Datenflussanalyse).
    /// </summary>
    static SourceText Instrument(SyntaxTree tree, SemanticModel model)
    {
        var text = tree.GetText();
        var inserts = new List<(int Position, int Order, string Text)>();
        var order = 0;

        string Checkpoint(StatementSyntax statement, int line)
        {
            var vars = new StringBuilder();
            var enclosing = model.GetEnclosingSymbol(statement.SpanStart);
            var flow = model.AnalyzeDataFlow(statement);
            if (flow is { Succeeded: true })
            {
                // Sicher zugewiesen heißt nicht sichtbar (z. B. Schleifenvariable nach der Schleife)
                var visible = model.LookupSymbols(statement.SpanStart).ToHashSet(SymbolEqualityComparer.Default);
                foreach (var symbol in flow.DefinitelyAssignedOnEntry)
                {
                    if (!visible.Contains(symbol) || !SymbolEqualityComparer.Default.Equals(symbol.ContainingSymbol, enclosing)) continue;
                    var (type, refKind) = symbol switch
                    {
                        ILocalSymbol l => (l.Type, l.RefKind),
                        IParameterSymbol p => (p.Type, p.RefKind),
                        _ => (null, RefKind.None),
                    };
                    if (type is null || refKind != RefKind.None || type.IsRefLikeType || type.TypeKind == TypeKind.Pointer) continue;
                    if (symbol.Name.StartsWith("<") || symbol.Name == "args" && symbol is IParameterSymbol { ContainingSymbol.Name: "<Main>$" }) continue;
                    vars.Append($"global::KlonkLib.Klonk.__v(\"{symbol.Name}\", {symbol.Name}); ");
                }
            }
            return $"if (global::KlonkLib.Klonk.__cp({line})) {{ {vars}global::KlonkLib.Klonk.__pause(); }} ";
        }
        int LineOf(SyntaxNode node) => node.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
        void Wrap(StatementSyntax body, StatementSyntax anchor)
        {
            var flowTarget = body is BlockSyntax b ? (b.Statements.Count > 0 ? b.Statements[0] : anchor) : body;
            inserts.Add((body.SpanStart, order++, "{ " + Checkpoint(flowTarget, LineOf(anchor))));
            inserts.Add((body.Span.End, order++, " }"));
        }

        foreach (var statement in tree.GetRoot().DescendantNodes().OfType<StatementSyntax>())
        {
            switch (statement.Parent)
            {
                case BlockSyntax or SwitchSectionSyntax or GlobalStatementSyntax:
                    if (statement is LocalFunctionStatementSyntax) break;
                    inserts.Add((statement.SpanStart, order++, Checkpoint(statement, LineOf(statement))));
                    break;
                case WhileStatementSyntax or DoStatementSyntax or ForStatementSyntax or ForEachStatementSyntax or ForEachVariableStatementSyntax:
                    Wrap(statement, (StatementSyntax)statement.Parent);
                    break;
                case IfStatementSyntax or ElseClauseSyntax or UsingStatementSyntax or LockStatementSyntax when statement is not BlockSyntax:
                    Wrap(statement, statement);
                    break;
            }
        }
        // Von hinten einfügen; bei gleicher Position in Einfügereihenfolge
        var changes = inserts.OrderBy(i => i.Position).ThenBy(i => i.Order).GroupBy(i => i.Position)
            .Select(g => new TextChange(new TextSpan(g.Key, 0), string.Concat(g.Select(i => i.Text))));
        return text.WithChanges(changes);
    }

    // Ohne Reflexion (getrimmt): Werte als JsonNode
    static string Json(params (string Key, JsonNode? Value)[] fields)
    {
        var json = new JsonObject();
        foreach (var (key, value) in fields) json[key] = value;
        return json.ToJsonString();
    }

    /// <summary>Console-Ausgabe zeilenweise an die IDE</summary>
    sealed class LineWriter(Action<string> print) : TextWriter
    {
        readonly StringBuilder line = new();
        public override Encoding Encoding => Encoding.UTF8;
        public override void Write(char value)
        {
            if (value == '\n') { print(line.ToString()); line.Clear(); }
            else if (value != '\r') line.Append(value);
        }
        public override void Flush()
        {
            if (line.Length > 0) { print(line.ToString()); line.Clear(); }
        }
    }
}
