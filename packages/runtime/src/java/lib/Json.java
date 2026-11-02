package klonk;

import java.util.List;
import java.util.Map;

/**
 * JSON lesen und schreiben: {@code Json.parse(text)} liefert JsonObject, JsonArray, String, Number, Boolean oder null;
 * {@code Json.stringify(wert, einrückung)} schreibt es wieder.
 */
public final class Json {
    private Json() {}

    public static Object parse(String text) {
        Parser parser = new Parser(text);
        parser.space();
        Object value = parser.value();
        parser.space();
        if (parser.pos < text.length()) throw parser.error("unexpected text");
        return value;
    }

    public static JsonObject parseObject(String text) { return new JsonObject(text); }
    public static JsonArray parseArray(String text) { return new JsonArray(text); }

    public static String stringify(Object value, int indent) {
        StringBuilder out = new StringBuilder();
        write(out, value, indent, 0);
        return out.toString();
    }

    /** Text mit Anführungszeichen und Escapes */
    public static String quote(String text) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '"') out.append("\\\"");
            else if (c == '\\') out.append("\\\\");
            else if (c == '\n') out.append("\\n");
            else if (c == '\r') out.append("\\r");
            else if (c == '\t') out.append("\\t");
            else if (c < 0x20) {
                String hex = Integer.toHexString(c);
                out.append("\\u");
                for (int k = hex.length(); k < 4; k++) out.append('0');
                out.append(hex);
            }
            else out.append(c);
        }
        return out.append('"').toString();
    }

    /** Java-Werte in JSON-Werte umwandeln (Map ⇒ JsonObject, List/Array ⇒ JsonArray) */
    static Object wrap(Object value) {
        if (value == null || value instanceof String || value instanceof Number || value instanceof Boolean
            || value instanceof JsonObject || value instanceof JsonArray) return value;
        if (value instanceof Character) return String.valueOf(((Character) value).charValue());
        if (value instanceof Map) {
            Map<?, ?> map = (Map<?, ?>) value;
            JsonObject object = new JsonObject();
            for (Object key : map.keySet()) object.put(String.valueOf(key), map.get(key));
            return object;
        }
        if (value instanceof List) {
            JsonArray array = new JsonArray();
            for (Object item : (List<?>) value) array.put(item);
            return array;
        }
        if (value instanceof Object[]) {
            JsonArray array = new JsonArray();
            for (Object item : (Object[]) value) array.put(item);
            return array;
        }
        if (value instanceof int[]) {
            JsonArray array = new JsonArray();
            for (int item : (int[]) value) array.put(item);
            return array;
        }
        if (value instanceof double[]) {
            JsonArray array = new JsonArray();
            for (double item : (double[]) value) array.put(item);
            return array;
        }
        return String.valueOf(value);
    }

    static String asString(Object value, String where) {
        if (value instanceof String) return (String) value;
        if (value instanceof Number || value instanceof Boolean) return String.valueOf(value);
        throw new JsonException(where + " is not a string");
    }

    static Number asNumber(Object value, String where) {
        if (value instanceof Number) return (Number) value;
        if (value instanceof String) {
            try {
                return Double.valueOf(Double.parseDouble((String) value));
            }
            catch (NumberFormatException e) {
                // unten
            }
        }
        throw new JsonException(where + " is not a number");
    }

    static boolean asBoolean(Object value, String where) {
        if (value instanceof Boolean) return ((Boolean) value).booleanValue();
        if ("true".equals(value)) return true;
        if ("false".equals(value)) return false;
        throw new JsonException(where + " is not a boolean");
    }

    static JsonObject asObject(Object value, String where) {
        if (value instanceof JsonObject) return (JsonObject) value;
        throw new JsonException(where + " is not a JsonObject");
    }

    static JsonArray asArray(Object value, String where) {
        if (value instanceof JsonArray) return (JsonArray) value;
        throw new JsonException(where + " is not a JsonArray");
    }

    static String number(Number value) {
        if (value instanceof Double || value instanceof Float) {
            double d = value.doubleValue();
            if (d == Math.rint(d) && Math.abs(d) < 1e15) return String.valueOf((long) d);
            return String.valueOf(d);
        }
        return String.valueOf(value.longValue());
    }

    private static void newline(StringBuilder out, int indent, int depth) {
        if (indent <= 0) return;
        out.append('\n');
        for (int i = 0; i < indent * depth; i++) out.append(' ');
    }

    private static void write(StringBuilder out, Object value, int indent, int depth) {
        value = wrap(value);
        if (value == null) out.append("null");
        else if (value instanceof String) out.append(quote((String) value));
        else if (value instanceof Number) out.append(number((Number) value));
        else if (value instanceof Boolean) out.append(((Boolean) value).booleanValue() ? "true" : "false");
        else if (value instanceof JsonObject) {
            JsonObject object = (JsonObject) value;
            if (object.length() == 0) { out.append("{}"); return; }
            out.append('{');
            boolean first = true;
            for (String key : object.keySet()) {
                if (!first) out.append(',');
                first = false;
                newline(out, indent, depth + 1);
                out.append(quote(key)).append(indent > 0 ? ": " : ":");
                write(out, object.opt(key), indent, depth + 1);
            }
            newline(out, indent, depth);
            out.append('}');
        }
        else {
            JsonArray array = (JsonArray) value;
            if (array.length() == 0) { out.append("[]"); return; }
            out.append('[');
            for (int i = 0; i < array.length(); i++) {
                if (i > 0) out.append(',');
                newline(out, indent, depth + 1);
                write(out, array.opt(i), indent, depth + 1);
            }
            newline(out, indent, depth);
            out.append(']');
        }
    }

    private static final class Parser {
        final String text;
        int pos;

        Parser(String text) { this.text = text == null ? "" : text; }

        JsonException error(String message) {
            int line = 1;
            for (int i = 0; i < pos && i < text.length(); i++) if (text.charAt(i) == '\n') line++;
            return new JsonException("JSON: " + message + " (line " + line + ")");
        }

        void space() {
            while (pos < text.length() && Character.isWhitespace(text.charAt(pos))) pos++;
        }

        char peek() {
            if (pos >= text.length()) throw error("unexpected end");
            return text.charAt(pos);
        }

        Object value() {
            char c = peek();
            if (c == '{') return object();
            if (c == '[') return array();
            if (c == '"') return string();
            if (text.startsWith("true", pos)) { pos += 4; return Boolean.TRUE; }
            if (text.startsWith("false", pos)) { pos += 5; return Boolean.FALSE; }
            if (text.startsWith("null", pos)) { pos += 4; return null; }
            if (c == '-' || (c >= '0' && c <= '9')) return number();
            throw error("unexpected character '" + c + "'");
        }

        JsonObject object() {
            JsonObject object = new JsonObject();
            pos++;
            space();
            if (peek() == '}') { pos++; return object; }
            while (true) {
                space();
                if (peek() != '"') throw error("expected a key");
                String key = string();
                space();
                if (peek() != ':') throw error("expected ':'");
                pos++;
                space();
                object.put(key, value());
                space();
                char c = peek();
                pos++;
                if (c == '}') return object;
                if (c != ',') throw error("expected ',' or '}'");
            }
        }

        JsonArray array() {
            JsonArray array = new JsonArray();
            pos++;
            space();
            if (peek() == ']') { pos++; return array; }
            while (true) {
                space();
                array.put(value());
                space();
                char c = peek();
                pos++;
                if (c == ']') return array;
                if (c != ',') throw error("expected ',' or ']'");
            }
        }

        String string() {
            StringBuilder out = new StringBuilder();
            pos++;
            while (true) {
                char c = peek();
                pos++;
                if (c == '"') return out.toString();
                if (c != '\\') { out.append(c); continue; }
                char e = peek();
                pos++;
                if (e == 'n') out.append('\n');
                else if (e == 't') out.append('\t');
                else if (e == 'r') out.append('\r');
                else if (e == 'b') out.append('\b');
                else if (e == 'f') out.append('\f');
                else if (e == 'u') {
                    if (pos + 4 > text.length()) throw error("bad unicode escape");
                    out.append((char) Integer.parseInt(text.substring(pos, pos + 4), 16));
                    pos += 4;
                }
                else out.append(e);
            }
        }

        Object number() {
            int start = pos;
            if (peek() == '-') pos++;
            boolean decimal = false;
            while (pos < text.length()) {
                char c = text.charAt(pos);
                if (c >= '0' && c <= '9') pos++;
                else if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') { decimal = true; pos++; }
                else break;
            }
            String part = text.substring(start, pos);
            try {
                if (decimal) return Double.valueOf(Double.parseDouble(part));
                long value = Long.parseLong(part);
                if (value >= Integer.MIN_VALUE && value <= Integer.MAX_VALUE) return Integer.valueOf((int) value);
                return Long.valueOf(value);
            }
            catch (NumberFormatException e) {
                throw error("bad number " + part);
            }
        }
    }
}
