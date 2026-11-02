package klonk;

import java.util.ArrayList;
import java.util.List;

/**
 * YAML lesen und schreiben (übliche Blockschreibweise): {@code Yaml.parse(text)} liefert wie {@link Json#parse}
 * JsonObject, JsonArray oder einen Wert; {@code Yaml.stringify(wert)} schreibt YAML. Unterstützt Schlüssel/Werte,
 * Listen mit „- “, Einrückung, Kommentare, Texte in Anführungszeichen und Inline-JSON ([…], {…}).
 * Nicht unterstützt: Anker/Referenzen, mehrzeilige Texte (| und >), mehrere Dokumente.
 */
public final class Yaml {
    private Yaml() {}

    public static Object parse(String text) {
        Reader reader = new Reader(text == null ? "" : text);
        if (reader.lines.isEmpty()) return null;
        Object value = reader.block(reader.lines.get(0).indent);
        if (reader.index < reader.lines.size()) throw reader.error("unexpected indentation");
        return value;
    }

    public static JsonObject parseObject(String text) { return Json.asObject(parse(text), "YAML document"); }

    public static String stringify(Object value) {
        StringBuilder out = new StringBuilder();
        value = Json.wrap(value);
        if (value instanceof JsonObject || value instanceof JsonArray) write(out, value, 0);
        else out.append(scalar(value)).append('\n');
        return out.toString();
    }

    private static void indent(StringBuilder out, int depth) {
        for (int i = 0; i < depth; i++) out.append("  ");
    }

    private static void write(StringBuilder out, Object value, int depth) {
        if (value instanceof JsonObject) {
            JsonObject object = (JsonObject) value;
            if (object.length() == 0) { indent(out, depth); out.append("{}\n"); return; }
            for (String key : object.keySet()) {
                Object item = object.opt(key);
                indent(out, depth);
                out.append(key(key)).append(':');
                if (item instanceof JsonObject && ((JsonObject) item).length() > 0) {
                    out.append('\n');
                    write(out, item, depth + 1);
                }
                else if (item instanceof JsonArray && ((JsonArray) item).length() > 0) {
                    out.append('\n');
                    write(out, item, depth);
                }
                else out.append(' ').append(scalar(item)).append('\n');
            }
        }
        else {
            JsonArray array = (JsonArray) value;
            for (int i = 0; i < array.length(); i++) {
                Object item = array.opt(i);
                indent(out, depth);
                out.append("- ");
                if (item instanceof JsonObject && ((JsonObject) item).length() > 0) {
                    // erster Schlüssel hinter „- “, die übrigen eingerückt
                    StringBuilder inner = new StringBuilder();
                    write(inner, item, depth + 1);
                    out.append(inner.substring((depth + 1) * 2));
                }
                else if (item instanceof JsonArray && ((JsonArray) item).length() > 0) {
                    out.append(Json.stringify(item, 0)).append('\n');
                }
                else out.append(scalar(item)).append('\n');
            }
        }
    }

    private static String key(String key) {
        return plain(key) ? key : Json.quote(key);
    }

    private static String scalar(Object value) {
        if (value == null) return "null";
        if (value instanceof JsonObject || value instanceof JsonArray) return Json.stringify(value, 0);
        if (value instanceof Number) return Json.number((Number) value);
        if (value instanceof Boolean) return ((Boolean) value).booleanValue() ? "true" : "false";
        String text = String.valueOf(value);
        return plain(text) && typed(text) instanceof String ? text : Json.quote(text);
    }

    /** Text ohne Anführungszeichen schreibbar? */
    private static boolean plain(String text) {
        if (text.isEmpty() || !text.trim().equals(text)) return false;
        char first = text.charAt(0);
        if ("-?:,[]{}#&*!|>'\"%@`".indexOf(first) >= 0) return false;
        return text.indexOf(": ") < 0 && text.indexOf(" #") < 0 && !text.endsWith(":") && text.indexOf('\n') < 0;
    }

    /** Wert eines ungequoteten Textes: Zahl, Wahrheitswert, null oder Text */
    static Object typed(String text) {
        if (text.equals("null") || text.equals("~") || text.isEmpty()) return null;
        if (text.equals("true") || text.equals("True") || text.equals("TRUE")) return Boolean.TRUE;
        if (text.equals("false") || text.equals("False") || text.equals("FALSE")) return Boolean.FALSE;
        char c = text.charAt(0);
        if (c == '-' || c == '+' || c == '.' || (c >= '0' && c <= '9')) {
            boolean digits = false;
            boolean decimal = false;
            for (int i = 0; i < text.length(); i++) {
                char d = text.charAt(i);
                if (d >= '0' && d <= '9') digits = true;
                else if (d == '.' || d == 'e' || d == 'E') decimal = true;
                else if (!((d == '-' || d == '+') && (i == 0 || text.charAt(i - 1) == 'e' || text.charAt(i - 1) == 'E'))) return text;
            }
            if (!digits) return text;
            try {
                if (decimal) return Double.valueOf(Double.parseDouble(text));
                long value = Long.parseLong(text.startsWith("+") ? text.substring(1) : text);
                if (value >= Integer.MIN_VALUE && value <= Integer.MAX_VALUE) return Integer.valueOf((int) value);
                return Long.valueOf(value);
            }
            catch (NumberFormatException e) {
                return text;
            }
        }
        return text;
    }

    private static final class Line {
        final int indent;
        String content;
        final int number;

        Line(int indent, String content, int number) {
            this.indent = indent;
            this.content = content;
            this.number = number;
        }
    }

    private static final class Reader {
        final List<Line> lines = new ArrayList<Line>();
        int index;

        Reader(String text) {
            String[] raw = text.split("\n", -1);
            for (int n = 0; n < raw.length; n++) {
                String line = stripComment(raw[n].replace("\r", "").replace("\t", "  "));
                if (line.trim().isEmpty() || line.trim().equals("---")) continue;
                int indent = 0;
                while (indent < line.length() && line.charAt(indent) == ' ') indent++;
                lines.add(new Line(indent, line.trim(), n + 1));
            }
        }

        JsonException error(String message) {
            int line = index < lines.size() ? lines.get(index).number : lines.isEmpty() ? 1 : lines.get(lines.size() - 1).number;
            return new JsonException("YAML: " + message + " (line " + line + ")");
        }

        static String stripComment(String line) {
            char quote = 0;
            for (int i = 0; i < line.length(); i++) {
                char c = line.charAt(i);
                if (quote != 0) {
                    if (c == quote) quote = 0;
                }
                else if (c == '"' || c == '\'') quote = c;
                else if (c == '#' && (i == 0 || line.charAt(i - 1) == ' ')) return line.substring(0, i);
            }
            return line;
        }

        static boolean isItem(String content) {
            return content.equals("-") || content.startsWith("- ");
        }

        /** Position des Doppelpunkts eines „schlüssel: wert“ (außerhalb von Anführungszeichen), sonst -1 */
        static int colon(String content) {
            char quote = 0;
            for (int i = 0; i < content.length(); i++) {
                char c = content.charAt(i);
                if (quote != 0) {
                    if (c == quote) quote = 0;
                }
                else if ((c == '"' || c == '\'') && i == 0) quote = c;
                else if (c == ':' && (i + 1 == content.length() || content.charAt(i + 1) == ' ')) return i;
                else if ((c == '[' || c == '{') && i == 0) return -1;
            }
            return -1;
        }

        Object block(int indent) {
            Line line = lines.get(index);
            if (isItem(line.content)) return sequence(indent);
            if (colon(line.content) >= 0) return mapping(indent);
            index++;
            return value(line.content);
        }

        JsonArray sequence(int indent) {
            JsonArray array = new JsonArray();
            while (index < lines.size() && lines.get(index).indent == indent && isItem(lines.get(index).content)) {
                Line line = lines.get(index);
                String rest = line.content.substring(1).trim();
                if (rest.isEmpty()) {
                    index++;
                    if (index < lines.size() && lines.get(index).indent > indent) array.put(block(lines.get(index).indent));
                    else array.put((Object) null);
                }
                else if (colon(rest) >= 0 || isItem(rest)) {
                    // „- schlüssel: wert“ ⇒ Objekt, dessen weitere Schlüssel darunter eingerückt stehen
                    int inner = indent + (line.content.length() - rest.length());
                    lines.set(index, new Line(inner, rest, line.number));
                    array.put(block(inner));
                }
                else {
                    index++;
                    array.put(value(rest));
                }
            }
            return array;
        }

        JsonObject mapping(int indent) {
            JsonObject object = new JsonObject();
            while (index < lines.size() && lines.get(index).indent == indent && !isItem(lines.get(index).content)) {
                Line line = lines.get(index);
                int at = colon(line.content);
                if (at < 0) throw error("expected 'key: value'");
                String key = unquote(line.content.substring(0, at).trim());
                String rest = line.content.substring(at + 1).trim();
                index++;
                if (!rest.isEmpty()) object.put(key, value(rest));
                else if (index < lines.size() && (lines.get(index).indent > indent || (lines.get(index).indent == indent && isItem(lines.get(index).content)))) {
                    object.put(key, block(lines.get(index).indent));
                }
                else object.put(key, (Object) null);
            }
            if (index < lines.size() && lines.get(index).indent > indent) throw error("unexpected indentation");
            return object;
        }

        Object value(String text) {
            if (text.startsWith("[") || text.startsWith("{")) {
                try {
                    return Json.parse(text);
                }
                catch (JsonException e) {
                    throw error("inline lists/objects must be written as JSON");
                }
            }
            if (text.startsWith("\"") || text.startsWith("'")) return unquote(text);
            return typed(text);
        }

        static String unquote(String text) {
            if (text.length() >= 2 && text.startsWith("\"") && text.endsWith("\"")) {
                Object value = Json.parse(text);
                return String.valueOf(value);
            }
            if (text.length() >= 2 && text.startsWith("'") && text.endsWith("'")) return text.substring(1, text.length() - 1).replace("''", "'");
            return text;
        }
    }
}
