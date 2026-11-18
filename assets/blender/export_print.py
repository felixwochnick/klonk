"""
Druckvorlagen der Figuren (3D-Druck) aus denselben Modellen wie in der App.

    blender -b --factory-startup --python assets/blender/export_print.py

Baut die Figuren mit build_models.py (ohne Animationen ⇒ Ruhehaltung), vereinigt alle Teile zu einem geschlossenen
Körper und exportiert sie in Millimetern (1 Einheit = 1 Feld = 32 mm) nach apps/docs/public/print/klonk-figur-<modell>.stl.
Die Noppenlöcher der Füße werden an die gedruckten Noppen angepasst (Ø 4,8 mm, 1,8 mm hoch – siehe assets/print):
Ø 4,9 mm und 1,9 mm tief, damit die Figur klemmt und flach aufsteht.

Nur die Standardfigur (männlich) und mit Druckanpassungen (PRINT_PATCHES, die Figuren der App bleiben unverändert):
breiterer Hals (bricht nicht ab), Arme gerade und anliegend am Oberkörper, Hände als Würfel mit Trennkerbe
seitlich an der Hüfte – so gibt es kaum Überhang und die Hände wachsen am Bein mit hoch.
"""
import math
import os

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'apps', 'docs', 'public', 'print')
MM = 32.0                       # Millimeter je Einheit (1 Feld = 4 × 4 Noppen à 8 mm)
HOLE_D = 4.9 / MM
HOLE_DEPTH = 1.9 / MM

# Abweichungen der Druckfigur von der App-Figur (Text in build_models.py ⇒ Ersatz)
PRINT_PATCHES = (
    # Arme senkrecht und etwas in den Oberkörper gerückt ⇒ der Greifring liegt am Bein an (tiefster Punkt nur 0,2 mm darunter)
    ('ARM_TILT = math.radians(4)', 'ARM_TILT = 0.0'),
    ('ARM_OUT = 0.058', 'ARM_OUT = 0.025'),
    # Unterarm gerade nach unten statt 55° nach vorn ⇒ kein frei hängender Unterarm
    ('FOREARM_ANGLE = math.radians(-55)', 'FOREARM_ANGLE = 0.0'),
    # Hals Ø 6,1 statt 4,2 mm
    ("cylinder('Neck', 0.065,", "cylinder('Neck', 0.095,"),
    # Hand als Würfel (3,5 mm) statt C-Greifring, darüber eine umlaufende Trennkerbe (0,4 mm hoch, 0,35 mm tief) zum Arm;
    # der Würfel liegt innen an Hüfte/Bein an ⇒ druckt ohne Stütze
    ("        b.add(h, j[f'Hand{side}'], cylinder(f'Wrist{side}', 0.026, 0.05, tuple(hand - d * 0.015), m_skin, col, rotation=arm_rot(side, (FOREARM_ANGLE + math.pi, 0, 0))))\n"
     "        grip = hand + d * (0.03 + major + minor * 0.6)\n"
     "        b.add(h, j[f'Hand{side}'], c_ring(f'Grip{side}', major, minor, math.radians(75), math.pi, tuple(grip), m_skin, col, rotation=frame_euler(axis, gap_dir)))\n",
     "        cube, notch, inset = 0.11, 0.0125, 0.011\n"
     "        b.add(h, j[f'Hand{side}'], box(f'HandNotch{side}', (cube - 2 * inset, cube - 2 * inset, notch + 0.02), (hand.x, hand.y, hand.z - notch - 0.01), m_skin, col, bevel=0.003))\n"
     "        b.add(h, j[f'Hand{side}'], box(f'HandCube{side}', (cube, cube, cube), (hand.x, hand.y, hand.z - notch - cube), m_skin, col, bevel=0.008))\n"),
)

# build_models.py ohne den Aufruf von main() laden – nur die Bausteine
source = open(os.path.join(HERE, 'build_models.py'), encoding='utf-8').read()
source = source[:source.rindex('\nmain()')]
for old, new in PRINT_PATCHES:
    assert source.count(old) == 1, f'Druckanpassung passt nicht mehr zu build_models.py: {old!r}'
    source = source.replace(old, new)
ns = {'__file__': os.path.join(HERE, 'build_models.py'), '__name__': 'klonk_models'}
exec(compile(source, 'build_models.py', 'exec'), ns)
ns['build_clips'] = lambda joints: None     # keine Animationen ⇒ Ruhehaltung
_cut = ns['cut']


def cut_print_hole(obj, cutter):
    """Noppenlöcher der Füße gleich beim Bauen mit Druckmaßen schneiden (nachträgliches Füllen ergäbe deckungsgleiche Flächen)"""
    if cutter.name.startswith('Hole'):
        x, y = cutter.location.x, cutter.location.y
        bpy.data.objects.remove(cutter)
        cutter = cylinder(HOLE_D / 2, HOLE_DEPTH + 0.002, x, y, -0.002)
    _cut(obj, cutter)


ns['cut'] = cut_print_hole


def mesh_objects(col):
    return [o for o in col.all_objects if o.type == 'MESH']


def baked_copy(objects, name):
    """Alle Teile in Weltkoordinaten zu einem Mesh zusammenführen"""
    bm = bmesh.new()
    for obj in objects:
        tmp = bmesh.new()
        tmp.from_mesh(obj.data)
        tmp.transform(obj.matrix_world)
        mesh = bpy.data.meshes.new('tmp')
        tmp.to_mesh(mesh)
        tmp.free()
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def boolean(obj, operation, operand=None, self_union=False):
    mod = obj.modifiers.new(operation, 'BOOLEAN')
    mod.operation = operation
    mod.solver = 'EXACT'
    if operand is not None:
        mod.object = operand
    mod.use_self = self_union
    mod.use_hole_tolerant = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if operand is not None:
        bpy.data.objects.remove(operand)


def cylinder(radius, depth, x, y, z):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=radius, radius2=radius, depth=depth)
    for v in bm.verts:
        v.co.z += depth / 2 + z
        v.co.x += x
        v.co.y += y
    mesh = bpy.data.meshes.new('cyl')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('cyl', mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def non_manifold(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    count = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    return count


def printable(col, name):
    body = baked_copy(mesh_objects(col), f'print-{name}')
    # Ein leerer Partner genügt: `use_self` vereinigt die sich überschneidenden Teile des Meshes selbst
    empty = bpy.data.objects.new('none', bpy.data.meshes.new('none'))
    bpy.context.scene.collection.objects.link(empty)
    boolean(body, 'UNION', empty, self_union=True)
    return body


def main():
    ns['reset_scene']()
    os.makedirs(OUT, exist_ok=True)
    for name, shirt, pants, hair, style in (
        ('male', '#0055bf', '#3a3a3a', '#5b3a1e', 'short'),
    ):
        col, _ = ns['build_character'](name, shirt, pants, hair, style)
        body = printable(col, name)
        bpy.ops.object.select_all(action='DESELECT')
        body.select_set(True)
        bpy.context.view_layer.objects.active = body
        path = os.path.abspath(os.path.join(OUT, f'klonk-figur-{name}.stl'))
        bpy.ops.wm.stl_export(filepath=path, export_selected_objects=True, global_scale=MM, apply_modifiers=True)
        dims = [round(d * MM, 2) for d in body.dimensions]
        print(f'[klonk] {name}: {path} – {dims} mm, nicht-mannigfaltige Kanten: {non_manifold(body)}')
        bpy.data.objects.remove(body)
        for obj in list(col.all_objects):
            bpy.data.objects.remove(obj)
        bpy.data.collections.remove(col)


main()
