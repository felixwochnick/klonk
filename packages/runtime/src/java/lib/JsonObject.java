package klonk;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;

/**
 * JSON-Objekt (Schlüssel ⇒ Wert, Reihenfolge bleibt) mit einer an org.json angelehnten API:
 * {@code new JsonObject("{\"a\": 1}").getInt("a")}, {@code put("b", true)}, {@code toString(2)}.
 * Werte: String, Number, Boolean, JsonObject, JsonArray oder {@code null}.
 */
public class JsonObject {
    private final LinkedHashMap<String, Object> map = new LinkedHashMap<String, Object>();

    public JsonObject() {}

    /** JSON-Text lesen (muss ein Objekt sein) */
    public JsonObject(String json) {
        Object value = Json.parse(json);
        if (!(value instanceof JsonObject)) throw new JsonException("JSON text is not an object");
        JsonObject other = (JsonObject) value;
        for (String key : other.keySet()) map.put(key, other.opt(key));
    }

    public JsonObject put(String key, Object value) { map.put(key, Json.wrap(value)); return this; }
    public JsonObject put(String key, int value) { map.put(key, Integer.valueOf(value)); return this; }
    public JsonObject put(String key, long value) { map.put(key, Long.valueOf(value)); return this; }
    public JsonObject put(String key, double value) { map.put(key, Double.valueOf(value)); return this; }
    public JsonObject put(String key, boolean value) { map.put(key, Boolean.valueOf(value)); return this; }

    public boolean has(String key) { return map.containsKey(key); }
    public Object remove(String key) { return map.remove(key); }
    public int length() { return map.size(); }
    public Set<String> keySet() { return map.keySet(); }
    public List<String> keys() { return new ArrayList<String>(map.keySet()); }

    /** Wert oder {@code null} */
    public Object opt(String key) { return map.get(key); }

    /** Wert; fehlt der Schlüssel, gibt es einen Fehler */
    public Object get(String key) {
        if (!map.containsKey(key)) throw new JsonException("JsonObject[\"" + key + "\"] not found");
        return map.get(key);
    }

    public String getString(String key) { return Json.asString(get(key), key); }
    public int getInt(String key) { return Json.asNumber(get(key), key).intValue(); }
    public long getLong(String key) { return Json.asNumber(get(key), key).longValue(); }
    public double getDouble(String key) { return Json.asNumber(get(key), key).doubleValue(); }
    public boolean getBoolean(String key) { return Json.asBoolean(get(key), key); }
    public JsonObject getJsonObject(String key) { return Json.asObject(get(key), key); }
    public JsonArray getJsonArray(String key) { return Json.asArray(get(key), key); }

    public String optString(String key, String fallback) { return has(key) && opt(key) != null ? Json.asString(opt(key), key) : fallback; }
    public int optInt(String key, int fallback) { return has(key) && opt(key) instanceof Number ? ((Number) opt(key)).intValue() : fallback; }
    public double optDouble(String key, double fallback) { return has(key) && opt(key) instanceof Number ? ((Number) opt(key)).doubleValue() : fallback; }
    public boolean optBoolean(String key, boolean fallback) { return has(key) && opt(key) instanceof Boolean ? ((Boolean) opt(key)).booleanValue() : fallback; }

    /** Kompakt, z. B. zum Speichern */
    @Override public String toString() { return Json.stringify(this, 0); }
    /** Lesbar mit Einrückung */
    public String toString(int indent) { return Json.stringify(this, indent); }
}
