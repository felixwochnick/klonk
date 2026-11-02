/**
 * Roboter-API für Java: Klasse `klonk.Klonk`, wird mitkompiliert und per `import klonk.Klonk;` +
 * `import static klonk.Klonk.*;` (Farben, `print`, `sleep`, `random`) eingebunden. Jede Figur ist ein Objekt:
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
        int count();
        String nameAt(int index);
        void print(String text);
        void sleepSeconds(double seconds);
        int random(int min, int max);
        boolean checkpoint(int line);
        void variable(String name, String value);
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

    // Im Worker zeigt \`window\` auf das globale Objekt (siehe java/run.ts)
    private static final Api API = Window.current().<Global>cast().getKlonk();

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

    public static int random(int min, int max) { return API.random(min, max); }
    public static void sleep(double seconds) { API.sleepSeconds(seconds); }

    public static void print(Object... values) {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < values.length; i++) {
            if (i > 0) text.append(' ');
            text.append(show(values[i]));
        }
        API.print(text.toString());
    }

    // Debugger (vom Instrumentierer eingefügt, unqualifiziert über den statischen Import – eine Variable
    // namens \`klonk\` würde einen voll qualifizierten Aufruf verdecken)
    public static boolean __cp(int line) { return API.checkpoint(line); }
    public static void __pause() { API.pause(); }
    public static void __v(String name, int value) { API.variable(name, String.valueOf(value)); }
    public static void __v(String name, long value) { API.variable(name, String.valueOf(value)); }
    public static void __v(String name, double value) { API.variable(name, String.valueOf(value)); }
    public static void __v(String name, float value) { API.variable(name, String.valueOf(value)); }
    public static void __v(String name, boolean value) { API.variable(name, String.valueOf(value)); }
    public static void __v(String name, char value) { API.variable(name, "'" + value + "'"); }
    public static void __v(String name, Object value) { API.variable(name, value instanceof String ? "\\"" + value + "\\"" : show(value)); }

    private static String show(Object value) {
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

/** Import der Roboter-API – wird in Zeile 1 eingefügt (Zeilennummern bleiben gleich) */
export const ROBOT_IMPORT = 'import klonk.Klonk; import static klonk.Klonk.*; '
