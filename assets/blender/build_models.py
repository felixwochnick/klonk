"""
Erzeugt die Standard-3D-Modelle von Klonk in Klemmbaustein-Optik und exportiert sie als glTF (.glb).

    blender -b --factory-startup --python assets/blender/build_models.py

Ergebnis:
  apps/app/public/models/*.glb       – Modelle für die 3D-Welt (three.js)
  assets/blender/klonk-models.blend  – Quelldatei zum Weiterbearbeiten
  assets/blender/preview.png         – Vorschau aller Modelle

Maße: 1 Feld = 1 Einheit = 2×2 Noppen. Ein Ziegel ist 0,6 hoch (Verhältnis 9,6 mm : 16 mm).
glTF ist Y-oben; Blender-„vorne“ (-Y) wird in three.js zu +Z. Ursprung jedes Modells: Mitte der Unterseite.
Ziegel, Platte und Fliese sind weiß und werden in three.js eingefärbt.
"""
import math
import os

import bmesh
import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'app', 'public', 'models')

BRICK_H = 0.6
PLATE_H = 0.2
GAP = 0.01           # Fuge zwischen Nachbarsteinen
STUD_R = 0.15
STUD_H = 0.1
STUD_POS = 0.25      # Abstand der Noppen von der Mitte (2×2)


# ---------------------------------------------------------------------------
# Hilfsfunktionen

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def material(name, color, roughness=0.35):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(color), 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def srgb_to_linear(hex_color):
    def channel(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    h = hex_color.lstrip('#')
    return tuple(channel(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def link(obj, col):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def box(name, size, location, mat, bevel=0.02, col=None):
    """Quader mit abgerundeten Kanten; `location` = Mitte der Unterseite"""
    sx, sy, sz = size
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z = (v.co.z + 0.5) * sz
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) / 3), segments=2, affect='EDGES', profile=0.5)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    mesh.materials.append(mat)
    (col or bpy.context.scene.collection).objects.link(obj)
    smooth(obj)
    return obj


def cylinder(name, radius, depth, location, mat, rotation=(0, 0, 0), col=None, vertices=24):
    """Zylinder; `location` = Mitte der Unterseite (entlang der lokalen Z-Achse)"""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=vertices, radius1=radius, radius2=radius, depth=depth)
    for v in bm.verts:
        v.co.z += depth / 2
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    mesh.materials.append(mat)
    (col or bpy.context.scene.collection).objects.link(obj)
    smooth(obj)
    return obj


def smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    # Kanten trotzdem scharf halten
    mod = obj.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True


def studs(prefix, top_z, mat, col, positions=None):
    positions = positions or [(sx * STUD_POS, sy * STUD_POS) for sx in (-1, 1) for sy in (-1, 1)]
    return [cylinder(f'{prefix}Stud{i}', STUD_R, STUD_H, (x, y, top_z), mat, col=col) for i, (x, y) in enumerate(positions)]


def join(objects, name):
    """Objekte zu einem Mesh vereinen (weniger Draw-Calls in three.js)"""
    for obj in objects:
        for mod in list(obj.modifiers):
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    joined.data.name = name
    return joined


def empty(name, location, col, parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.location = location
    obj.empty_display_size = 0.1
    col.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def parent_to(child, parent):
    """Kind an Gelenk hängen, ohne die Weltposition zu verändern"""
    bpy.context.view_layer.update()
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world


# ---------------------------------------------------------------------------
# Bauteile der Welt

def build_brick(white):
    col = collection('brick')
    size = 1 - 2 * GAP
    body = box('BrickBody', (size, size, BRICK_H - 0.005), (0, 0, 0), white, bevel=0.015, col=col)
    parts = [body, *studs('Brick', BRICK_H - 0.005, white, col)]
    link(join(parts, 'brick'), col)
    return col


def build_plate(white):
    col = collection('plate')
    size = 1 - 2 * GAP
    body = box('PlateBody', (size, size, PLATE_H), (0, 0, 0), white, bevel=0.012, col=col)
    link(join([body, *studs('Plate', PLATE_H, white, col)], 'plate'), col)
    return col


def build_tile(white):
    # Glatte Fliese ohne Noppen – Marke auf einem Feld
    col = collection('tile')
    size = 1 - 6 * GAP
    tile = box('tile', (size, size, 0.07), (0, 0, 0), white, bevel=0.01, col=col)
    for mod in list(tile.modifiers):
        bpy.context.view_layer.objects.active = tile
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return col


# ---------------------------------------------------------------------------
# Figuren (aus Ziegeln gebaut, keine Minifiguren-Nachbildung)

SKIN = '#e8b48a'
EYE = '#1b1b1b'


def build_character(name, shirt, pants, hair, hair_style):
    col = collection(f'character-{name}')
    m_skin = material(f'{name}-skin', SKIN, 0.5)
    m_shirt = material(f'{name}-shirt', shirt)
    m_pants = material(f'{name}-pants', pants)
    m_hair = material(f'{name}-hair', hair, 0.6)
    m_eye = material('eye', EYE, 0.2)

    root = empty(f'character-{name}', (0, 0, 0), col)

    # Beine mit Gelenk an der Hüfte (für die Laufanimation)
    for side, x in (('L', 0.1), ('R', -0.1)):
        hip = empty(f'Leg{side}', (x, 0, 0.58), col, root)
        leg = box(f'Leg{side}Mesh', (0.17, 0.22, 0.5), (x, 0, 0.08), m_pants, col=col)
        shoe = box(f'Shoe{side}', (0.18, 0.26, 0.09), (x, -0.02, 0), m_pants, bevel=0.03, col=col)
        parent_to(leg, hip)
        parent_to(shoe, hip)

    hips = box('Hips', (0.42, 0.24, 0.1), (0, 0, 0.56), m_pants, col=col)
    torso = box('Torso', (0.5, 0.28, 0.5), (0, 0, 0.66), m_shirt, bevel=0.04, col=col)
    neck = cylinder('Neck', 0.08, 0.06, (0, 0, 1.15), m_skin, col=col)
    head = box('Head', (0.36, 0.34, 0.34), (0, 0, 1.2), m_skin, bevel=0.06, col=col)
    for obj in (hips, torso, neck, head):
        parent_to(obj, root)

    # Gesicht: zwei Augen und ein Lächeln (auf der Vorderseite, Blender -Y)
    for i, x in enumerate((-0.075, 0.075)):
        eye = cylinder(f'Eye{i}', 0.028, 0.012, (x, -0.168, 1.41), m_eye, rotation=(math.pi / 2, 0, 0), col=col)
        parent_to(eye, root)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.011, location=(0, -0.172, 1.33), rotation=(math.pi / 2, 0, 0))
    smile = bpy.context.active_object
    smile.name = 'Smile'
    bm = bmesh.new()
    bm.from_mesh(smile.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 0.01], context='VERTS')  # nur untere Bogenhälfte
    bm.to_mesh(smile.data)
    bm.free()
    smile.data.materials.append(m_eye)
    link(smile, col)
    parent_to(smile, root)

    # Arme mit Gelenk an der Schulter
    for side, x in (('L', 0.33), ('R', -0.33)):
        shoulder = empty(f'Arm{side}', (x, 0, 1.1), col, root)
        arm = box(f'Arm{side}Mesh', (0.14, 0.17, 0.42), (x, 0, 0.7), m_shirt, bevel=0.04, col=col)
        hand = box(f'Hand{side}', (0.12, 0.14, 0.11), (x, 0, 0.6), m_skin, bevel=0.04, col=col)
        parent_to(arm, shoulder)
        parent_to(hand, shoulder)

    # Frisuren
    hair_parts = [box('HairCap', (0.4, 0.38, 0.11), (0, 0.01, 1.5), m_hair, bevel=0.05, col=col)]
    if hair_style == 'short':
        hair_parts.append(box('HairFringe', (0.38, 0.06, 0.07), (0, -0.16, 1.47), m_hair, bevel=0.025, col=col))
    elif hair_style == 'long':
        hair_parts.append(box('HairBack', (0.4, 0.08, 0.36), (0, 0.17, 1.17), m_hair, bevel=0.03, col=col))
        for x in (-0.19, 0.19):
            hair_parts.append(box('HairSide', (0.05, 0.3, 0.26), (x, 0.03, 1.25), m_hair, bevel=0.02, col=col))
        hair_parts.append(box('HairFringe', (0.38, 0.06, 0.06), (0, -0.16, 1.48), m_hair, bevel=0.025, col=col))
    elif hair_style == 'bun':
        hair_parts.append(box('HairSide', (0.06, 0.32, 0.2), (0.19, 0.02, 1.32), m_hair, bevel=0.025, col=col))
        hair_parts.append(box('HairFringe', (0.24, 0.06, 0.08), (0.06, -0.16, 1.45), m_hair, bevel=0.025, col=col))
        hair_parts.append(cylinder('HairBun', 0.1, 0.12, (0, 0.02, 1.6), m_hair, col=col))
    for part in hair_parts:
        parent_to(part, root)

    # Noppe auf dem Kopf – das Klemmbaustein-Merkmal
    knob = cylinder('HeadStud', 0.08, 0.06, (0, 0.01, 1.61 if hair_style != 'bun' else 1.72), m_hair, col=col)
    parent_to(knob, root)
    return col


# ---------------------------------------------------------------------------
# Export

def export(col, filename):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in col.all_objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, filename),
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
    )


def preview(cols):
    # Modelle nebeneinander aufstellen und eine Vorschau rendern
    offset = 0
    for col in cols:
        for obj in col.objects:
            if obj.parent is None:
                obj.location.x += offset
        offset += 1.2
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 10), rotation=(0.6, 0.2, 0.8))
    bpy.context.active_object.data.energy = 3
    world = bpy.data.worlds.new('World')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.9, 0.92, 0.95, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    bpy.context.scene.world = world
    bpy.ops.object.camera_add(location=(offset / 2 - 0.6, -6.5, 2.6), rotation=(math.radians(76), 0, 0))
    cam = bpy.context.active_object
    cam.data.lens = 32
    bpy.context.scene.camera = cam
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 450
    scene.render.filepath = os.path.join(ROOT, 'assets', 'blender', 'preview.png')
    bpy.ops.render.render(write_still=True)
    # Für die .blend-Datei wieder an den Ursprung
    offset = 0
    for col in cols:
        for obj in col.objects:
            if obj.parent is None:
                obj.location.x -= offset
        offset += 1.2


def main():
    reset_scene()
    os.makedirs(OUT, exist_ok=True)
    white = material('brick-white', '#ffffff', 0.3)

    parts = {
        'brick.glb': build_brick(white),
        'plate.glb': build_plate(white),
        'tile.glb': build_tile(white),
        'character-male.glb': build_character('male', '#0055bf', '#3a3a3a', '#5b3a1e', 'short'),
        'character-female.glb': build_character('female', '#c91a09', '#1f3b70', '#b98a3e', 'long'),
        'character-diverse.glb': build_character('diverse', '#237841', '#c9b48a', '#6b2f86', 'bun'),
    }

    # Jede Collection einzeln exportieren
    for filename, col in parts.items():
        for other in parts.values():
            other.hide_viewport = other is not col
        export(col, filename)
    for col in parts.values():
        col.hide_viewport = False

    preview(list(parts.values()))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'assets', 'blender', 'klonk-models.blend'))
    print('[klonk] Modelle exportiert nach', OUT)


main()
