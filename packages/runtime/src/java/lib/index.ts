import Json from './Json.java?raw'
import JsonArray from './JsonArray.java?raw'
import JsonException from './JsonException.java?raw'
import JsonObject from './JsonObject.java?raw'
import Xml from './Xml.java?raw'
import Yaml from './Yaml.java?raw'

/**
 * Bibliotheken im Paket `klonk`, die jedes Java-Programm importieren kann (`import klonk.JsonObject;`):
 * JSON, YAML und XML. Eigene Klassen statt org.json: dessen Quelltext braucht Reflection, `getClass()` und
 * Annotationen mit Argumenten – die kennt der Browser-javac (teavm-javac) nicht bzw. stürzt daran ab.
 */
export const JAVA_LIBRARY: Record<string, string> = {
  'Json.java': Json,
  'JsonArray.java': JsonArray,
  'JsonException.java': JsonException,
  'JsonObject.java': JsonObject,
  'Xml.java': Xml,
  'Yaml.java': Yaml,
}
