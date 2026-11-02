package klonk;

import java.util.ArrayList;

/** JSON-Liste mit einer an org.json angelehnten API ({@code length()}, {@code getString(i)}, {@code put(…)}) */
public class JsonArray {
    private final ArrayList<Object> list = new ArrayList<Object>();

    public JsonArray() {}

    /** JSON-Text lesen (muss eine Liste sein) */
    public JsonArray(String json) {
        Object value = Json.parse(json);
        if (!(value instanceof JsonArray)) throw new JsonException("JSON text is not an array");
        JsonArray other = (JsonArray) value;
        for (int i = 0; i < other.length(); i++) list.add(other.opt(i));
    }

    public JsonArray put(Object value) { list.add(Json.wrap(value)); return this; }
    public JsonArray put(int value) { list.add(Integer.valueOf(value)); return this; }
    public JsonArray put(long value) { list.add(Long.valueOf(value)); return this; }
    public JsonArray put(double value) { list.add(Double.valueOf(value)); return this; }
    public JsonArray put(boolean value) { list.add(Boolean.valueOf(value)); return this; }
    public JsonArray put(int index, Object value) { list.set(index, Json.wrap(value)); return this; }

    public int length() { return list.size(); }
    public Object remove(int index) { return list.remove(index); }
    public Object opt(int index) { return index >= 0 && index < list.size() ? list.get(index) : null; }

    public Object get(int index) {
        if (index < 0 || index >= list.size()) throw new JsonException("JsonArray[" + index + "] not found");
        return list.get(index);
    }

    public String getString(int index) { return Json.asString(get(index), "[" + index + "]"); }
    public int getInt(int index) { return Json.asNumber(get(index), "[" + index + "]").intValue(); }
    public long getLong(int index) { return Json.asNumber(get(index), "[" + index + "]").longValue(); }
    public double getDouble(int index) { return Json.asNumber(get(index), "[" + index + "]").doubleValue(); }
    public boolean getBoolean(int index) { return Json.asBoolean(get(index), "[" + index + "]"); }
    public JsonObject getJsonObject(int index) { return Json.asObject(get(index), "[" + index + "]"); }
    public JsonArray getJsonArray(int index) { return Json.asArray(get(index), "[" + index + "]"); }

    @Override public String toString() { return Json.stringify(this, 0); }
    public String toString(int indent) { return Json.stringify(this, indent); }
}
