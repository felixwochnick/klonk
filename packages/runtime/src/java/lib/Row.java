package klonk;

/**
 * Eine Ergebniszeile von {@code Database.query}: Spaltenname ⇒ Wert. Wie bei JDBC liefern {@code getInt}/{@code getDouble}
 * für NULL 0 und {@code getString} null; {@code isNull} prüft das.
 */
public class Row extends JsonObject {
    public Row() {}

    @Override public String getString(String column) {
        Object value = get(column);
        return value == null ? null : "" + value;
    }
    @Override public int getInt(String column) { return number(column).intValue(); }
    @Override public long getLong(String column) { return number(column).longValue(); }
    @Override public double getDouble(String column) { return number(column).doubleValue(); }
    @Override public boolean getBoolean(String column) {
        Object value = get(column);
        if (value instanceof Boolean) return ((Boolean) value).booleanValue();
        return value instanceof Number && ((Number) value).doubleValue() != 0;
    }
    public boolean isNull(String column) { return get(column) == null; }

    private Number number(String column) {
        Object value = get(column);
        if (value == null) return Integer.valueOf(0);
        if (value instanceof Number) return (Number) value;
        if (value instanceof Boolean) return Integer.valueOf(((Boolean) value).booleanValue() ? 1 : 0);
        try {
            return Double.valueOf(Double.parseDouble("" + value));
        }
        catch (NumberFormatException e) {
            throw new JsonException(column + ": not a number");
        }
    }
}
