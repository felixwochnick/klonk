/**
 * Roboter-API für Java: Klasse `klonk.Klonk`, wird mitkompiliert; Programme importieren sie selbst mit
 * `import klonk.Klonk;` (+ `import static klonk.Klonk.*;` für Farben und `sleep`; Ausgabe wie gewohnt mit `System.out.println`). Jede Figur ist ein Objekt:
 * `Klonk karl = new Klonk("Karl"); karl.step();`. Die Methoden rufen über JSO (Schnittstellen auf `JSObject`)
 * die JS-Roboter-API im Worker (`globalThis.klonk`). Englische Namen wie in JS/TS; Farben als Konstanten in
 * Java-Schreibweise (`RED`). `wait` heißt `sleep`, weil jede Klasse `Object.wait()` erbt und das den
 * statischen Import verdecken würde.
 *
 * Hinweis: Eigene Annotationen und `@JSBody` bringen den Browser-javac (teavm-javac) zum Absturz – nur
 * `@JSProperty` und JSO-Schnittstellen verwenden.
 */
export const ROBOT_JAVA = `package klonk;

import org.teavm.jso.JSObject;
import org.teavm.jso.JSProperty;
import org.teavm.jso.browser.Window;

public final class Klonk {
    interface Global extends JSObject {
        @JSProperty Api getKlonk();
    }

    interface Api extends JSObject {
        Robot robot(String name);
        Robot robotAt(int number);
        Robot first();
        Robot create(String name, String look, int x, int y);
        int count();
        String nameAt(int index);
        String loadDesign(String name);
        void saveDesign(String name, String json);
        void sleepSeconds(double seconds);
        boolean checkpoint(int line);
        void variable(String name, String value);
        void heap(String json);
        void pause();
    }

    interface Robot extends JSObject {
        @JSProperty String getName();
        void step(int count);
        void turnLeft();
        void turnRight();
        void placeBrick(String color);
        void pickBrick();
        void setMark(String color);
        void removeMark();
        boolean isWall();
        boolean isBrick();
        boolean isBrick(String color);
        boolean isMark();
        boolean isMark(String color);
        boolean isFacingNorth();
        boolean isFacingEast();
        boolean isFacingSouth();
        boolean isFacingWest();
        int brickCount();
        int positionX();
        int positionY();
    }

    // Im Worker zeigt \`window\` auf das globale Objekt (siehe java/run.ts); Debug.java nutzt es mit
    static final Api API = Window.current().<Global>cast().getKlonk();

    public static final String RED = "red";
    public static final String BLUE = "blue";
    public static final String YELLOW = "yellow";
    public static final String GREEN = "green";
    public static final String ORANGE = "orange";
    public static final String PURPLE = "purple";
    public static final String WHITE = "white";
    public static final String BLACK = "black";

    private final Robot robot;
    /** Name der Figur (wie im Welt-Editor) */
    public final String name;

    /** Die erste Figur der Welt */
    public Klonk() { this(API.first()); }
    /** Die Figur mit diesem Namen */
    public Klonk(String name) { this(API.robot(name)); }
    /** Die n-te Figur (ab 1) */
    public Klonk(int number) { this(API.robotAt(number)); }
    private Klonk(Robot robot) {
        this.robot = robot;
        // Kopie über Verkettung: aus JSO kommende Strings liefern bei toString() sonst \`java.lang.String@…\`
        this.name = "" + robot.getName();
    }

    /** Neue Figur (Aussehen "male", "female", "diverse" oder eigenes Design), neben der zuletzt genutzten */
    public static Klonk create(String name) { return new Klonk(API.create(name, null, -1, -1)); }
    public static Klonk create(String name, String look) { return new Klonk(API.create(name, look, -1, -1)); }
    /** Neue Figur auf Feld x|y */
    public static Klonk create(String name, String look, int x, int y) { return new Klonk(API.create(name, look, x, y)); }

    /** Neue Figur mit eigenem Design (z. B. aus loadDesign, bearbeitet) */
    public static Klonk create(String name, JsonObject design) { return new Klonk(API.create(name, design.toString(), -1, -1)); }

    /** Design des Projekts als JSON-Text (Lizenz) – z. B. new JsonObject(Klonk.loadDesign("ritter")) */
    public static String loadDesign(String name) { return "" + API.loadDesign(name); }
    /** Design ins Projekt speichern (Datei name.klonkdesign.json, Lizenz) */
    public static void saveDesign(String name, String json) { API.saveDesign(name, json); }
    public static void saveDesign(String name, JsonObject design) { API.saveDesign(name, design.toString()); }

    /** Alle Figuren der Welt */
    public static Klonk[] all() {
        Klonk[] result = new Klonk[API.count()];
        for (int i = 0; i < result.length; i++) result[i] = new Klonk(API.nameAt(i));
        return result;
    }

    public String getName() { return name; }
    @Override public String toString() { return "Klonk(\\"" + name + "\\")"; }

    public void step() { robot.step(1); }
    public void step(int count) { robot.step(count); }
    public void turnLeft() { robot.turnLeft(); }
    public void turnRight() { robot.turnRight(); }
    public void placeBrick() { robot.placeBrick(RED); }
    public void placeBrick(String color) { robot.placeBrick(color); }
    public void pickBrick() { robot.pickBrick(); }
    public void setMark() { robot.setMark(YELLOW); }
    public void setMark(String color) { robot.setMark(color); }
    public void removeMark() { robot.removeMark(); }
    public boolean isWall() { return robot.isWall(); }
    public boolean isBrick() { return robot.isBrick(); }
    public boolean isBrick(String color) { return robot.isBrick(color); }
    public boolean isMark() { return robot.isMark(); }
    public boolean isMark(String color) { return robot.isMark(color); }
    public boolean isFacingNorth() { return robot.isFacingNorth(); }
    public boolean isFacingEast() { return robot.isFacingEast(); }
    public boolean isFacingSouth() { return robot.isFacingSouth(); }
    public boolean isFacingWest() { return robot.isFacingWest(); }
    public int brickCount() { return robot.brickCount(); }
    public int positionX() { return robot.positionX(); }
    public int positionY() { return robot.positionY(); }

    /** Warten (Sekunden) – Thread.sleep gibt es im Browser nicht */
    public static void sleep(double seconds) { API.sleepSeconds(seconds); }

    static String show(Object value) {
        if (value instanceof Object[]) return java.util.Arrays.deepToString((Object[]) value);
        if (value instanceof int[]) return java.util.Arrays.toString((int[]) value);
        if (value instanceof double[]) return java.util.Arrays.toString((double[]) value);
        if (value instanceof boolean[]) return java.util.Arrays.toString((boolean[]) value);
        if (value instanceof char[]) return java.util.Arrays.toString((char[]) value);
        if (value instanceof long[]) return java.util.Arrays.toString((long[]) value);
        return String.valueOf(value);
    }
}
`

/**
 * Debugger-Aufrufe für den Instrumentierer (`__cp`, `__v`, `__pause`). Eigene Klasse, damit der unsichtbare
 * Import in Zeile 1 nicht die Roboter-API mitbringt – die importiert das Programm selbst (`import klonk.Klonk;`).
 * Unqualifiziert über den statischen Import – eine Variable namens `klonk` würde `klonk.Debug.__cp` verdecken.
 *
 * Speicherabbild fürs Objektdiagramm ohne Reflection (gibt es im Browser-javac nicht): Der Instrumentierer lässt jede
 * eigene Klasse `__Inspect` implementieren; `__klonkInspect()` meldet Klasse (`__cls`) und Attribute (`__f`).
 */
export const DEBUG_JAVA = String.raw`package klonk;

public final class Debug {
    private Debug() {}

    public interface __Inspect { void __klonkInspect(); }

    private static final class Prim {
        final String text;
        Prim(String text) { this.text = text; }
    }

    // Variablen des Haltepunkts (für das Speicherabbild)
    private static final java.util.ArrayList<String> names = new java.util.ArrayList<String>();
    private static final java.util.ArrayList<Object> values = new java.util.ArrayList<Object>();

    public static boolean __cp(int line) {
        boolean stop = Klonk.API.checkpoint(line);
        if (stop) {
            names.clear();
            values.clear();
        }
        return stop;
    }
    public static void __pause() {
        Klonk.API.heap(heap());
        Klonk.API.pause();
    }
    private static void keep(String name, Object value) {
        names.add(name);
        values.add(value);
    }
    public static void __v(String name, int value) { Klonk.API.variable(name, String.valueOf(value)); keep(name, new Prim(String.valueOf(value))); }
    public static void __v(String name, long value) { Klonk.API.variable(name, String.valueOf(value)); keep(name, new Prim(String.valueOf(value))); }
    public static void __v(String name, double value) { Klonk.API.variable(name, String.valueOf(value)); keep(name, new Prim(String.valueOf(value))); }
    public static void __v(String name, float value) { Klonk.API.variable(name, String.valueOf(value)); keep(name, new Prim(String.valueOf(value))); }
    public static void __v(String name, boolean value) { Klonk.API.variable(name, String.valueOf(value)); keep(name, new Prim(String.valueOf(value))); }
    public static void __v(String name, char value) { Klonk.API.variable(name, "'" + value + "'"); keep(name, new Prim("'" + value + "'")); }
    public static void __v(String name, Object value) { Klonk.API.variable(name, value instanceof String ? "\"" + value + "\"" : Klonk.show(value)); keep(name, value); }

    // Speicherabbild als JSON (Breitensuche ab den Variablen, gleiche Objekte = gleiche ID)
    private static final java.util.ArrayList<Object> objects = new java.util.ArrayList<Object>();
    private static StringBuilder fields = new StringBuilder();
    private static String className = "Object";
    private static int fieldCount;
    private static boolean more;
    private static boolean truncated;

    public static void __cls(String name) { className = name; }
    public static void __f(String name, int value) { field(name, new Prim(String.valueOf(value))); }
    public static void __f(String name, long value) { field(name, new Prim(String.valueOf(value))); }
    public static void __f(String name, double value) { field(name, new Prim(String.valueOf(value))); }
    public static void __f(String name, float value) { field(name, new Prim(String.valueOf(value))); }
    public static void __f(String name, boolean value) { field(name, new Prim(String.valueOf(value))); }
    public static void __f(String name, char value) { field(name, new Prim("'" + value + "'")); }
    public static void __f(String name, Object value) { field(name, value); }

    private static void field(String name, Object value) {
        if (fieldCount >= 30) {
            more = true;
            return;
        }
        if (fieldCount++ > 0) fields.append(',');
        fields.append('[').append(quote(name)).append(',').append(value(value)).append(']');
    }

    private static String prim(String text) {
        if (text.length() > 60) text = text.substring(0, 59) + "…";
        return "{\"value\":" + quote(text) + "}";
    }

    private static String value(Object v) {
        if (v instanceof Prim) return prim(((Prim) v).text);
        if (v == null) return prim("null");
        if (v instanceof String) return prim("\"" + v + "\"");
        if (v instanceof Number || v instanceof Boolean) return prim(String.valueOf(v));
        if (v instanceof Character) return prim("'" + v + "'");
        if (v instanceof Enum) return prim(((Enum<?>) v).name());
        for (int i = 0; i < objects.size(); i++) if (objects.get(i) == v) return "{\"ref\":" + (i + 1) + "}";
        if (objects.size() >= 60) {
            truncated = true;
            return prim("…");
        }
        objects.add(v);
        return "{\"ref\":" + objects.size() + "}";
    }

    private static String quote(String text) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c == '\n') out.append("\\n");
            else if (c < 32) out.append(' ');
            else out.append(c);
        }
        return out.append('"').toString();
    }

    private static String heap() {
        objects.clear();
        truncated = false;
        StringBuilder out = new StringBuilder("{\"variables\":[");
        for (int i = 0; i < names.size(); i++) {
            if (i > 0) out.append(',');
            out.append('[').append(quote(names.get(i))).append(',').append(value(values.get(i))).append(']');
        }
        out.append("],\"objects\":[");
        for (int i = 0; i < objects.size(); i++) {
            Object o = objects.get(i);
            fields = new StringBuilder();
            fieldCount = 0;
            more = false;
            className = "Object";
            String robot = null;
            if (o instanceof __Inspect) {
                ((__Inspect) o).__klonkInspect();
            }
            else if (o instanceof Klonk) {
                className = "Klonk";
                robot = ((Klonk) o).name;
                field("name", robot);
            }
            else if (o instanceof Database) {
                className = "Database";
                field("name", ((Database) o).name);
                field("engine", ((Database) o).engine);
            }
            else if (o instanceof java.util.List) {
                className = o instanceof java.util.ArrayList ? "ArrayList" : o instanceof java.util.LinkedList ? "LinkedList" : "List";
                int n = 0;
                for (Object item : (java.util.List<?>) o) field("[" + n++ + "]", item);
            }
            else if (o instanceof java.util.Map) {
                className = o instanceof java.util.HashMap ? "HashMap" : o instanceof java.util.TreeMap ? "TreeMap" : "Map";
                java.util.Map<?, ?> map = (java.util.Map<?, ?>) o;
                for (Object key : map.keySet()) field("[" + (key instanceof String ? "\"" + key + "\"" : String.valueOf(key)) + "]", map.get(key));
            }
            else if (o instanceof java.util.Collection) {
                className = o instanceof java.util.HashSet ? "HashSet" : o instanceof java.util.TreeSet ? "TreeSet" : "Collection";
                int n = 0;
                for (Object item : (java.util.Collection<?>) o) field("[" + n++ + "]", item);
            }
            else if (o instanceof Object[]) {
                className = "Array";
                Object[] array = (Object[]) o;
                for (int n = 0; n < array.length; n++) field("[" + n + "]", array[n]);
            }
            else if (o instanceof int[]) {
                className = "int[]";
                int[] array = (int[]) o;
                for (int n = 0; n < array.length; n++) __f("[" + n + "]", array[n]);
            }
            else if (o instanceof double[]) {
                className = "double[]";
                double[] array = (double[]) o;
                for (int n = 0; n < array.length; n++) __f("[" + n + "]", array[n]);
            }
            else if (o instanceof boolean[]) {
                className = "boolean[]";
                boolean[] array = (boolean[]) o;
                for (int n = 0; n < array.length; n++) __f("[" + n + "]", array[n]);
            }
            else if (o instanceof char[]) {
                className = "char[]";
                char[] array = (char[]) o;
                for (int n = 0; n < array.length; n++) __f("[" + n + "]", array[n]);
            }
            else if (o instanceof long[]) {
                className = "long[]";
                long[] array = (long[]) o;
                for (int n = 0; n < array.length; n++) __f("[" + n + "]", array[n]);
            }
            if (i > 0) out.append(',');
            out.append("{\"id\":").append(i + 1).append(",\"className\":").append(quote(className)).append(",\"fields\":[").append(fields.toString()).append(']');
            if (robot != null) out.append(",\"robot\":").append(quote(robot));
            if (more) out.append(",\"more\":true");
            out.append('}');
        }
        out.append("],\"truncated\":").append(truncated).append('}');
        return out.toString();
    }
}
`

/** Unsichtbarer Import des Debuggers – wird in Zeile 1 eingefügt (Zeilennummern bleiben gleich) */
export const DEBUG_IMPORT = 'import static klonk.Debug.*; '
