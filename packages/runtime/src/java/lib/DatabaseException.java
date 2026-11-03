package klonk;

/** Fehler der Datenbank, z. B. ein Syntaxfehler im SQL */
public class DatabaseException extends RuntimeException {
    private final String text;

    public DatabaseException(String message) {
        super(message);
        this.text = message;
    }

    /** Meldung der Datenbank (eigene Methode: die Klassenbibliothek des Browser-javac kennt Throwable.getMessage() nicht) */
    public String getMessage() { return text; }

    @Override public String toString() { return "klonk.DatabaseException: " + text; }
}
