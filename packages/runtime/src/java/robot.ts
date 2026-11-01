/**
 * Roboter-API für Java: Klasse `klonk.Robot`, wird mitkompiliert und per `import static klonk.Robot.*` eingebunden.
 * Die Methoden rufen über JSO (Schnittstellen auf `JSObject`) die JS-Roboter-API im Worker (`globalThis.klonk`).
 * Englische Namen wie in JS/TS; Farben als Konstanten in Java-Schreibweise (`RED`). `wait` heißt `sleep`,
 * weil jede Klasse `Object.wait()` erbt und das den statischen Import verdecken würde.
 *
 * Hinweis: Eigene Annotationen und `@JSBody` bringen den Browser-javac (teavm-javac) zum Absturz – nur
 * `@JSProperty` und JSO-Schnittstellen verwenden.
 */
export const ROBOT_JAVA = `package klonk;

import org.teavm.jso.JSObject;
import org.teavm.jso.JSProperty;
import org.teavm.jso.browser.Window;

public final class Robot {
    private Robot() {}

    interface Global extends JSObject {
        @JSProperty Api getKlonk();
    }

    interface Api extends JSObject {
        void step(int count);
        void turnLeft();
        void turnRight();
        void placeBrick(String color);
        void pickBrick();
        void setMark(String color);
        void removeMark();
        void selectCharacter(String name);
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
        void print(String text);
        void sleepSeconds(double seconds);
        int random(int min, int max);
        boolean checkpoint(int line);
        void variable(String name, String value);
        void pause();
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

    public static void step() { API.step(1); }
    public static void step(int count) { API.step(count); }
    public static void turnLeft() { API.turnLeft(); }
    public static void turnRight() { API.turnRight(); }
    public static void placeBrick() { API.placeBrick(RED); }
    public static void placeBrick(String color) { API.placeBrick(color); }
    public static void pickBrick() { API.pickBrick(); }
    public static void setMark() { API.setMark(YELLOW); }
    public static void setMark(String color) { API.setMark(color); }
    public static void removeMark() { API.removeMark(); }
    public static void selectCharacter(String name) { API.selectCharacter(name); }
    public static boolean isWall() { return API.isWall(); }
    public static boolean isBrick() { return API.isBrick(); }
    public static boolean isBrick(String color) { return API.isBrick(color); }
    public static boolean isMark() { return API.isMark(); }
    public static boolean isMark(String color) { return API.isMark(color); }
    public static boolean isFacingNorth() { return API.isFacingNorth(); }
    public static boolean isFacingEast() { return API.isFacingEast(); }
    public static boolean isFacingSouth() { return API.isFacingSouth(); }
    public static boolean isFacingWest() { return API.isFacingWest(); }
    public static int brickCount() { return API.brickCount(); }
    public static int positionX() { return API.positionX(); }
    public static int positionY() { return API.positionY(); }
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

    // Debugger (vom Instrumentierer eingefügt)
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

/** Statischer Import der Roboter-API – wird in Zeile 1 eingefügt (Zeilennummern bleiben gleich) */
export const ROBOT_IMPORT = 'import static klonk.Robot.*; '
