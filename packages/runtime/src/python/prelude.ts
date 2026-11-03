/** Dateiname des Nutzerprogramms in Tracebacks */
export const USER_FILE = '<klonk>'

/**
 * Python-Vorspann: Modul `klonk` (Klasse `Klonk` – eine Figur je Objekt, Methoden in Python-Schreibweise wie
 * `turn_left`, `is_wall` – dazu `wait`, Farben und Designs; nur Englisch, nur per import; print/random wie gewohnt), Tracing für
 * Prüfpunkte (nur Zeilen der Nutzerdatei) und Variablenansicht.
 */
export const PRELUDE = String.raw`
import sys, re, types
import _klonk_js as _klonk_api
from _klonk_debug import checkpoint as _klonk_checkpoint

_KLONK_FILE = ${JSON.stringify(USER_FILE)}

def _klonk_snake(name):
    return re.sub(r'(?<=[a-zäöüß0-9])([A-ZÄÖÜ])', lambda m: '_' + m.group(1).lower(), name)

class Klonk:
    """Eine Figur der Welt: Klonk() ist die erste, Klonk("Klara") die mit diesem Namen, Klonk(2) die zweite."""
    __slots__ = ('_robot', 'name')

    def __init__(self, name=None):
        self._robot = _klonk_api.robot(name)
        self.name = self._robot.name

    def __repr__(self):
        return 'Klonk(' + repr(self.name) + ')'

    @staticmethod
    def all():
        """Alle Figuren der Welt"""
        return [Klonk(n) for n in _klonk_api.names()]

    @staticmethod
    def create(name, look=None, x=None, y=None):
        """Neue Figur: Aussehen "male"/"female"/"diverse" oder eigenes Design, optional auf Feld x|y"""
        if look is not None and not isinstance(look, str):
            import json
            look = json.dumps(look)
        return Klonk(_klonk_api.create(name, look, x, y).name)

def _klonk_method(js_name):
    def method(self, *args):
        return getattr(self._robot, js_name)(*args)
    method.__name__ = _klonk_snake(js_name)
    return method

for _js_name in _klonk_api.methods:
    setattr(Klonk, _klonk_snake(_js_name), _klonk_method(_js_name))

# Modul "klonk": nur per import verfügbar (from klonk import Klonk, red …); print bleibt Pythons eigenes
_klonk_module = types.ModuleType('klonk', 'Roboter-API von Klonk')
Klonk.__module__ = 'klonk'
_klonk_module.Klonk = Klonk
for _name in _klonk_api.globals:
    if _name != 'print':
        setattr(_klonk_module, _klonk_snake(_name), getattr(_klonk_api, _name))
_klonk_module.__all__ = [n for n in vars(_klonk_module) if not n.startswith('_')]
# Designs als dict laden/speichern (JSON-Text zwischen Python und JS)
import json as _klonk_json

def load_design(name):
    """Design des Projekts als dict (Lizenz)"""
    return _klonk_json.loads(_klonk_api.loadDesign(name))

def save_design(name, design):
    """Design (dict oder JSON-Text) ins Projekt speichern (Lizenz)"""
    _klonk_api.saveDesign(name, design if isinstance(design, str) else _klonk_json.dumps(design))

_klonk_module.load_design = load_design
_klonk_module.save_design = save_design

class DatabaseError(Exception):
    """Fehler der Datenbank, z. B. ein Syntaxfehler im SQL"""

class Database:
    """Datenbank des Projekts (Database.open("schule")) oder nur für diesen Lauf (Database.memory("postgres"))."""
    __slots__ = ('_handle', 'name', 'engine')

    def __init__(self, info):
        self._handle = info['handle']
        self.name = info['name']
        self.engine = info['engine']

    def __repr__(self):
        return 'Database(' + repr(self.name) + ', ' + self.engine + ')'

    @staticmethod
    def _call(request):
        answer = _klonk_json.loads(_klonk_api.db(_klonk_json.dumps(request, default=str)))
        if isinstance(answer, dict) and 'sqlError' in answer:
            raise DatabaseError(answer['sqlError'])
        return answer

    @staticmethod
    def open(name):
        """Datenbank des Projekts: Datei name.sqlite.sql bzw. name.postgres.sql"""
        return Database(Database._call({'op': 'open', 'name': name}))

    @staticmethod
    def memory(engine='sqlite'):
        """Neue, leere Datenbank nur für diesen Lauf: "sqlite" oder "postgres" """
        return Database(Database._call({'op': 'memory', 'engine': engine}))

    def _query(self, sql, params):
        if isinstance(params, (str, int, float, bool)) or params is None:
            params = [] if params is None else [params]
        return Database._call({'op': 'query', 'handle': self._handle, 'sql': sql, 'params': list(params)})

    def query(self, sql, params=()):
        """Abfrage ⇒ Liste von dicts (Spalte ⇒ Wert); Platzhalter: SQLite ?, PostgreSQL $1"""
        result = self._query(sql, params)
        return [dict(zip(result['columns'], row)) for row in result['rows']]

    def query_one(self, sql, params=()):
        """Erste Zeile als dict oder None"""
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def execute(self, sql, params=()):
        """Ändernde Anweisung (INSERT, UPDATE, DELETE, CREATE …) ⇒ Zahl geänderter Zeilen"""
        return self._query(sql, params)['changes'] or 0

    def tables(self):
        """Namen der Tabellen und Sichten"""
        return Database._call({'op': 'tables', 'handle': self._handle})

Database.__module__ = 'klonk'
DatabaseError.__module__ = 'klonk'
_klonk_module.Database = Database
_klonk_module.DatabaseError = DatabaseError
_klonk_module.__all__ = [n for n in vars(_klonk_module) if not n.startswith('_')]
sys.modules['klonk'] = _klonk_module

def _klonk_user_globals():
    return {'__name__': '__main__'}

def _klonk_variables(frame):
    result = {}
    for name, value in frame.f_locals.items():
        if name.startswith('__') or value is _klonk_module or getattr(_klonk_module, name, None) is value:
            continue
        if callable(value) or type(value).__name__ == 'module':
            continue
        try:
            text = repr(value)
        except Exception:
            text = '?'
        result[name] = text if len(text) <= 200 else text[:200] + '…'
    return result

def _klonk_trace(frame, event, arg):
    if frame.f_code.co_filename != _KLONK_FILE:
        return None
    if event == 'line':
        _klonk_checkpoint(frame.f_lineno, lambda: _klonk_variables(frame))
    return _klonk_trace

def _klonk_start():
    sys.settrace(_klonk_trace)

def _klonk_stop():
    sys.settrace(None)
`
