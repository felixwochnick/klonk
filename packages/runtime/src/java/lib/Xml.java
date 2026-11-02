package klonk;

/**
 * XML ⇄ JSON (wie org.json): {@code Xml.toJson(text)} liefert ein JsonObject mit dem Wurzelelement als Schlüssel;
 * Attribute und Kindelemente werden zu Schlüsseln, wiederholte Elemente zu JsonArrays, reiner Text zum Wert
 * (gemischter Text unter „content“). {@code Xml.fromJson(wert, "tag")} schreibt XML.
 */
public final class Xml {
    private Xml() {}

    public static JsonObject toJson(String xml) {
        Parser parser = new Parser(xml == null ? "" : xml);
        parser.skipMisc();
        JsonObject result = new JsonObject();
        String[] name = new String[1];
        Object value = parser.element(name);
        result.put(name[0], value);
        parser.skipMisc();
        if (parser.pos < parser.text.length()) throw parser.error("text after the root element");
        return result;
    }

    public static String fromJson(Object value, String tagName) {
        StringBuilder out = new StringBuilder();
        write(out, Json.wrap(value), tagName);
        return out.toString();
    }

    /** Text für XML maskieren */
    public static String escape(String text) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '<') out.append("&lt;");
            else if (c == '>') out.append("&gt;");
            else if (c == '&') out.append("&amp;");
            else if (c == '"') out.append("&quot;");
            else if (c == '\'') out.append("&apos;");
            else out.append(c);
        }
        return out.toString();
    }

    private static void write(StringBuilder out, Object value, String tag) {
        if (value instanceof JsonArray) {
            JsonArray array = (JsonArray) value;
            for (int i = 0; i < array.length(); i++) write(out, Json.wrap(array.opt(i)), tag);
            return;
        }
        out.append('<').append(tag);
        if (value == null) {
            out.append("/>");
            return;
        }
        out.append('>');
        if (value instanceof JsonObject) {
            JsonObject object = (JsonObject) value;
            for (String key : object.keySet()) {
                if (key.equals("content")) out.append(escape(text(object.opt(key))));
                else write(out, Json.wrap(object.opt(key)), key);
            }
        }
        else out.append(escape(text(value)));
        out.append("</").append(tag).append('>');
    }

    private static String text(Object value) {
        if (value == null) return "";
        if (value instanceof Number) return Json.number((Number) value);
        return String.valueOf(value);
    }

    private static final class Parser {
        final String text;
        int pos;

        Parser(String text) { this.text = text; }

        JsonException error(String message) {
            int line = 1;
            for (int i = 0; i < pos && i < text.length(); i++) if (text.charAt(i) == '\n') line++;
            return new JsonException("XML: " + message + " (line " + line + ")");
        }

        void skipSpace() {
            while (pos < text.length() && Character.isWhitespace(text.charAt(pos))) pos++;
        }

        /** Deklaration, Kommentare, DOCTYPE überspringen */
        void skipMisc() {
            while (true) {
                skipSpace();
                if (text.startsWith("<?", pos)) pos = end("?>");
                else if (text.startsWith("<!--", pos)) pos = end("-->");
                else if (text.startsWith("<!", pos) && !text.startsWith("<![CDATA[", pos)) pos = end(">");
                else return;
            }
        }

        int end(String marker) {
            int at = text.indexOf(marker, pos);
            if (at < 0) throw error("missing " + marker);
            return at + marker.length();
        }

        String name() {
            int start = pos;
            while (pos < text.length()) {
                char c = text.charAt(pos);
                if (Character.isLetterOrDigit(c) || c == '_' || c == '-' || c == '.' || c == ':') pos++;
                else break;
            }
            if (start == pos) throw error("expected a name");
            return text.substring(start, pos);
        }

        Object element(String[] nameOut) {
            if (!text.startsWith("<", pos)) throw error("expected '<'");
            pos++;
            String name = name();
            nameOut[0] = name;
            JsonObject object = new JsonObject();
            while (true) {
                skipSpace();
                if (text.startsWith("/>", pos)) {
                    pos += 2;
                    return object.length() == 0 ? "" : object;
                }
                if (text.startsWith(">", pos)) {
                    pos++;
                    break;
                }
                String attribute = name();
                skipSpace();
                if (!text.startsWith("=", pos)) throw error("expected '='");
                pos++;
                skipSpace();
                char quote = pos < text.length() ? text.charAt(pos) : 0;
                if (quote != '"' && quote != '\'') throw error("expected a quoted value");
                int close = text.indexOf(quote, pos + 1);
                if (close < 0) throw error("unclosed attribute value");
                add(object, attribute, Yaml.typed(decode(text.substring(pos + 1, close))));
                pos = close + 1;
            }
            StringBuilder content = new StringBuilder();
            while (true) {
                if (pos >= text.length()) throw error("missing </" + name + ">");
                if (text.startsWith("</", pos)) {
                    pos += 2;
                    String closing = name();
                    if (!closing.equals(name)) throw error("expected </" + name + "> but found </" + closing + ">");
                    skipSpace();
                    if (!text.startsWith(">", pos)) throw error("expected '>'");
                    pos++;
                    break;
                }
                if (text.startsWith("<!--", pos)) pos = end("-->");
                else if (text.startsWith("<![CDATA[", pos)) {
                    int close = text.indexOf("]]>", pos);
                    if (close < 0) throw error("missing ]]>");
                    content.append(text, pos + 9, close);
                    pos = close + 3;
                }
                else if (text.startsWith("<", pos)) {
                    String[] child = new String[1];
                    Object value = element(child);
                    add(object, child[0], value);
                }
                else {
                    int next = text.indexOf('<', pos);
                    if (next < 0) next = text.length();
                    content.append(decode(text.substring(pos, next)));
                    pos = next;
                }
            }
            String body = content.toString().trim();
            if (object.length() == 0) return Yaml.typed(body) == null && body.isEmpty() ? "" : Yaml.typed(body);
            if (!body.isEmpty()) add(object, "content", Yaml.typed(body));
            return object;
        }

        static void add(JsonObject object, String key, Object value) {
            if (!object.has(key)) {
                object.put(key, value);
                return;
            }
            Object existing = object.opt(key);
            if (existing instanceof JsonArray) ((JsonArray) existing).put(value);
            else object.put(key, new JsonArray().put(existing).put(value));
        }

        String decode(String raw) {
            if (raw.indexOf('&') < 0) return raw;
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < raw.length(); i++) {
                char c = raw.charAt(i);
                int semi = c == '&' ? raw.indexOf(';', i) : -1;
                if (semi < 0) {
                    out.append(c);
                    continue;
                }
                String entity = raw.substring(i + 1, semi);
                if (entity.equals("lt")) out.append('<');
                else if (entity.equals("gt")) out.append('>');
                else if (entity.equals("amp")) out.append('&');
                else if (entity.equals("quot")) out.append('"');
                else if (entity.equals("apos")) out.append('\'');
                else if (entity.startsWith("#x")) out.append((char) Integer.parseInt(entity.substring(2), 16));
                else if (entity.startsWith("#")) out.append((char) Integer.parseInt(entity.substring(1)));
                else {
                    out.append(c);
                    continue;
                }
                i = semi;
            }
            return out.toString();
        }
    }
}
