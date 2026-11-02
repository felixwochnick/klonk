package klonk;

/** Fehler beim Lesen oder Abfragen von JSON, YAML oder XML */
public class JsonException extends RuntimeException {
    public JsonException(String message) {
        super(message);
    }
}
