/** Dateiname des Nutzerprogramms in Tracebacks */
export const USER_FILE = '<klonk>'

/**
 * Python-Vorspann: Roboter-API als Builtins (de/en, dazu snake_case wie `turn_left` / `links_drehen`),
 * Tracing für Prüfpunkte (nur Zeilen der Nutzerdatei) und Variablenansicht.
 */
export const PRELUDE = String.raw`
import sys, re, builtins
import klonk as _klonk_api
from _klonk_debug import checkpoint as _klonk_checkpoint

_KLONK_FILE = ${JSON.stringify(USER_FILE)}
_klonk_names = {}

def _klonk_snake(name):
    return re.sub(r'(?<=[a-zäöüß0-9])([A-ZÄÖÜ])', lambda m: '_' + m.group(1).lower(), name)

for _name in dir(_klonk_api):
    if _name.startswith('_'):
        continue
    _value = getattr(_klonk_api, _name)
    for _spelling in {_name, _klonk_snake(_name)}:
        # print bleibt Pythons eigenes print (gleiche Ausgabe)
        if _spelling != 'print':
            _klonk_names[_spelling] = _value

# ausgabe(…) verhält sich wie print(…)
_klonk_names['ausgabe'] = print

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
