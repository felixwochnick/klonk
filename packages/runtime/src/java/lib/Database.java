package klonk;

import java.util.ArrayList;
import java.util.List;
import org.teavm.jso.JSObject;
import org.teavm.jso.JSProperty;
import org.teavm.jso.browser.Window;

/**
 * Datenbank des Projekts ({@code Database.open("schule")} ⇒ Datei schule.sqlite.sql bzw. schule.postgres.sql) oder
 * nur für diesen Lauf ({@code Database.memory("postgres")}). Platzhalter: SQLite {@code ?}, PostgreSQL {@code $1}.
 * Die Aufrufe gehen als JSON an die Datenbanken im Browser (siehe db/channel.ts).
 */
public final class Database {
    interface Global extends JSObject {
        @JSProperty Api getKlonk();
    }

    interface Api extends JSObject {
        String db(String request);
    }

    private static final Api API = Window.current().<Global>cast().getKlonk();

    private final int handle;
    /** Name der Datenbank (Dateiname ohne Endung bzw. "memory") */
    public final String name;
    /** "sqlite" oder "postgres" */
    public final String engine;

    private Database(JsonObject info) {
        this.handle = info.getInt("handle");
        this.name = info.getString("name");
        this.engine = info.getString("engine");
    }

    private static Object call(JsonObject request) {
        // Kopie über Verkettung: aus JSO kommende Strings liefern bei toString() sonst `java.lang.String@…`
        Object answer = Json.parse("" + API.db(request.toString()));
        if (answer instanceof JsonObject && ((JsonObject) answer).has("sqlError")) {
            throw new DatabaseException(((JsonObject) answer).getString("sqlError"));
        }
        return answer;
    }

    /** Datenbank des Projekts öffnen (Dateiname ohne Endung) */
    public static Database open(String name) {
        return new Database((JsonObject) call(new JsonObject().put("op", "open").put("name", name)));
    }

    /** Neue, leere SQLite-Datenbank nur für diesen Lauf */
    public static Database memory() { return memory("sqlite"); }

    /** Neue, leere Datenbank nur für diesen Lauf: "sqlite" oder "postgres" */
    public static Database memory(String engine) {
        return new Database((JsonObject) call(new JsonObject().put("op", "memory").put("engine", engine)));
    }

    private JsonObject run(String sql, Object[] params) {
        JsonArray values = new JsonArray();
        for (Object param : params) values.put(param);
        return (JsonObject) call(new JsonObject().put("op", "query").put("handle", handle).put("sql", sql).put("params", values));
    }

    /** Abfrage ⇒ Zeilen (Spalte ⇒ Wert) */
    public List<Row> query(String sql, Object... params) {
        JsonObject result = run(sql, params);
        JsonArray columns = result.getJsonArray("columns");
        JsonArray rows = result.getJsonArray("rows");
        List<Row> list = new ArrayList<Row>();
        for (int i = 0; i < rows.length(); i++) {
            JsonArray values = rows.getJsonArray(i);
            Row row = new Row();
            for (int c = 0; c < columns.length(); c++) row.put(columns.getString(c), values.opt(c));
            list.add(row);
        }
        return list;
    }

    /** Erste Zeile oder null */
    public Row queryOne(String sql, Object... params) {
        List<Row> rows = query(sql, params);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Ändernde Anweisung (INSERT, UPDATE, DELETE, CREATE …) ⇒ Zahl geänderter Zeilen */
    public int execute(String sql, Object... params) {
        JsonObject result = run(sql, params);
        return result.opt("changes") instanceof Number ? ((Number) result.opt("changes")).intValue() : 0;
    }

    /** Namen der Tabellen und Sichten */
    public List<String> tables() {
        JsonArray names = (JsonArray) call(new JsonObject().put("op", "tables").put("handle", handle));
        List<String> list = new ArrayList<String>();
        for (int i = 0; i < names.length(); i++) list.add(names.getString(i));
        return list;
    }

    public String getName() { return name; }
    public String getEngine() { return engine; }
    @Override public String toString() { return "Database(\"" + name + "\", " + engine + ")"; }
}
