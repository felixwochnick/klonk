/** Dateiname des Nutzerprogramms in Tracebacks */
export const USER_FILE = '<klonk>'

/**
 * Python-Vorspann: Klasse `Klonk` (eine Figur je Objekt, Methoden in Python-Schreibweise wie `turn_left`,
 * `is_wall`) und globale Funktionen/Farben als Builtins (nur Englisch), Tracing für Prüfpunkte
 * (nur Zeilen der Nutzerdatei) und Variablenansicht.
 */
export const PRELUDE = String.raw`
import sys, re, builtins
import klonk as _klonk_api
from _klonk_debug import checkpoint as _klonk_checkpoint

_KLONK_FILE = ${JSON.stringify(USER_FILE)}
_klonk_names = {}

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

def _klonk_method(js_name):
    def method(self, *args):
        return getattr(self._robot, js_name)(*args)
    method.__name__ = _klonk_snake(js_name)
    return method

for _js_name in _klonk_api.methods:
    setattr(Klonk, _klonk_snake(_js_name), _klonk_method(_js_name))

_klonk_names['Klonk'] = Klonk
for _name in _klonk_api.globals:
    # print bleibt Pythons eigenes print (gleiche Ausgabe)
    if _name != 'print':
        _klonk_names[_klonk_snake(_name)] = getattr(_klonk_api, _name)

# Als Builtins: sichtbar im Programm und in importierten Projektdateien, trotzdem überschreibbar
for _name, _value in _klonk_names.items():
    setattr(builtins, _name, _value)

def _klonk_user_globals():
    return {'__name__': '__main__'}

def _klonk_variables(frame):
    result = {}
    for name, value in frame.f_locals.items():
        if name.startswith('__') or name in _klonk_names and _klonk_names[name] is value:
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
