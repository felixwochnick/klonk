"""
Prototyp: Klötzchen-Figuren (Voxel-Stil) – leichter zu drucken als die Klemmbaustein-Figuren.

    blender -b --factory-startup --python assets/blender/build_blocky.py

Ergebnis:
  apps/app/public/models/character-blocky-<modell>.glb  – Figuren mit denselben Gelenken und Clips wie build_models.py
                                                          (in der App per localStorage `klonk:figures` = `blocky`)
  assets/print/blocky/klonk-klotz-<modell>.stl          – Druckvorlagen (mm, ein geschlossener Körper)
  assets/blender/preview-blocky.png                     – Vergleich bisherige Figur ↔ Klötzchen-Figur

Eigene Form, bewusst keine Kopie einer Spielfigur: Kopf breiter als tief, kurzer Oberkörper mit Gürtel, Klonk-Gesicht
(Augen mit Glanzpunkt, Wangen, Lächeln) aus flachen Quadern. Raster 1 „Pixel“ = 1/16 Feld = 2 mm.

Druckregeln (FDM, ohne Stützen, stehend): alles aus Quadern mit flachen Oberseiten; jedes Teil liegt auf etwas darunter
oder hängt höchstens 1 Pixel über (Kopf vorn/hinten, Hände), die langen Haare enden mit einer 45°-Schräge am Rücken.
Jeder Fuß ist genau 1×1 Noppe groß und hat ein Noppenloch (beim Druck Ø 4,9 × 1,9 mm wie export_print.py).
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

# build_models.py ohne den Aufruf von main() laden – Hilfsfunktionen, Materialien, Clips, Export
source = open(os.path.join(HERE, 'build_models.py'), encoding='utf-8').read()
source = source[:source.rindex('\nmain()')]
ns = {'__file__': os.path.join(HERE, 'build_models.py'), '__name__': 'klonk_models'}
exec(compile(source, 'build_models.py', 'exec'), ns)
globals().update({k: v for k, v in ns.items() if not k.startswith('__')})

PRINT_OUT = os.path.join(ROOT, 'assets', 'print', 'blocky')
MM = 32.0
PX = PITCH / 4               # 1 Pixel = 2 mm
B = 0.008                    # kleine Fase an allen Kanten (scharfe Klötzchen-Optik)

# Maße (Z oben, vorne = -Y)
LEG_W = PITCH - 0.012        # je Bein/Fuß genau eine Noppe
LEG_D = PITCH - 0.012
HIP_Z = 6 * PX               # Beine 6 Pixel hoch
BELT_Z = HIP_Z + 0.75 * PX
TORSO_W = 8 * PX - 0.01      # zwei Noppen breit
TORSO_D = 4 * PX
TORSO_Z1 = 12 * PX           # Oberkörper 6 Pixel
ARM_W = 3 * PX
ARM_D = 3.5 * PX
ARM_X = TORSO_W / 2 + ARM_W / 2 - 0.004     # Arme berühren den Oberkörper (beim Druck vereinigt)
SLEEVE_Z = TORSO_Z1 - 2.5 * PX
HAND_Z0 = HIP_Z + 0.5 * PX
HAND_Z1 = HAND_Z0 + 1.5 * PX
HEAD_W = 8 * PX
HEAD_D = 6 * PX              # Kopf breiter als tief – 1 Pixel Überhang vorn und hinten
HEAD_Z0 = TORSO_Z1
HEAD_Z1 = HEAD_Z0 + 7 * PX
FACE_Y = -HEAD_D / 2
RAISE = 0.015                # Gesichtsteile stehen 0,5 mm vor

JOINTS.clear()
JOINTS.update({
    'Hips': (None, (0, 0, HIP_Z)),
    'LegL': ('Hips', (LEG_X, 0, HIP_Z)),
    'LegR': ('Hips', (-LEG_X, 0, HIP_Z)),
    'Body': ('Hips', (0, 0, BELT_Z)),
    'Head': ('Body', (0, 0, HEAD_Z0)),
    'ArmL': ('Body', (ARM_X, 0, TORSO_Z1 - 1.5 * PX)),
    'ArmR': ('Body', (-ARM_X, 0, TORSO_Z1 - 1.5 * PX)),
    'HandL': ('ArmL', (ARM_X, 0, HAND_Z1)),
    'HandR': ('ArmR', (-ARM_X, 0, HAND_Z1)),
})

# Blinzeln: Augen sind flache Quader ohne Drehung ⇒ in der Höhe (Blender-Z) stauchen
for eye in ('EyeL', 'EyeR'):
    CLIPS['Idle'][1][eye] = [(0, {'scale': (1, 1, 1)}), (30, {'scale': (1, 1, 1)}), (32, {'scale': (1, 1, 0.1)}),
                             (34, {'scale': (1, 1, 1)}), (72, {'scale': (1, 1, 1)})]


def block(name, x0, x1, y0, y1, z0, z1, mat, col, bevel=B):
    """Quader zwischen zwei Ecken"""
    return box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0), mat, col, bevel=bevel, segments=1)


def wedge(name, x0, x1, y0, y1, z0, z1, mat, col):
    """Quader mit 45°-Schräge unten zur Rückseite des Oberkörpers hin (druckt ohne Stütze)"""
    bm = bmesh.new()
    depth = y1 - y0
    pts = [(y0, z0), (y1, z0 + depth), (y1, z1), (y0, z1)]
    verts = [[bm.verts.new((x, y, z)) for (y, z) in pts] for x in (x0, x1)]
    bm.faces.new(list(reversed(verts[0])))
    bm.faces.new(verts[1])
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((verts[0][i], verts[0][j], verts[1][j], verts[1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object(name, bm, mat, col)
    smooth(obj)
    return obj


def build_blocky_body(b, j, m_skin, m_shirt, m_pants, m_shoe):
    col = b.col
    for side, sx in (('L', 1), ('R', -1)):
        x = sx * LEG_X
        leg = f'Leg{side}Mesh'
        foot = block(f'Foot{side}', x - LEG_W / 2, x + LEG_W / 2, -LEG_D / 2, LEG_D / 2, 0, 1.5 * PX, m_shoe, col)
        cut(foot, cylinder(f'Hole{side}', STUD_R + 0.003, STUD_H + 0.004, (x, 0, -0.002), m_shoe, col))
        b.add(leg, j[f'Leg{side}'], foot)
        b.add(leg, j[f'Leg{side}'], block(f'Shin{side}', x - LEG_W / 2, x + LEG_W / 2, -LEG_D / 2, LEG_D / 2, 1.5 * PX - 0.002, HIP_Z + 0.01, m_pants, col))
    # Gürtel (Hüfte) und Oberkörper
    b.add('HipsMesh', j['Hips'], block('Belt', -TORSO_W / 2, TORSO_W / 2, -TORSO_D / 2, TORSO_D / 2, HIP_Z, BELT_Z + 0.002, m_pants, col))
    b.add('BodyMesh', j['Body'], block('Torso', -TORSO_W / 2, TORSO_W / 2, -TORSO_D / 2, TORSO_D / 2, BELT_Z, TORSO_Z1, m_shirt, col))
    # Arme: Ärmel (Oberteil), Unterarm (Haut), Hand als eigenes Gelenk
    for side, sx in (('L', 1), ('R', -1)):
        x0, x1 = sorted((sx * (ARM_X - ARM_W / 2), sx * (ARM_X + ARM_W / 2)))
        arm = f'Arm{side}Mesh'
        b.add(arm, j[f'Arm{side}'], block(f'Sleeve{side}', x0, x1, -ARM_D / 2, ARM_D / 2, SLEEVE_Z, TORSO_Z1, m_shirt, col))
        b.add(arm, j[f'Arm{side}'], block(f'Forearm{side}', x0 + 0.004, x1 - 0.004, -ARM_D / 2 + 0.004, ARM_D / 2 - 0.004, HAND_Z1 - 0.002, SLEEVE_Z + 0.002, m_skin, col))
        b.add(f'Hand{side}Mesh', j[f'Hand{side}'], block(f'Hand{side}', x0 + 0.004, x1 - 0.004, -ARM_D / 2 + 0.004, ARM_D / 2 - 0.004, HAND_Z0, HAND_Z1, m_skin, col))
    # Kopf
    b.add('HeadMesh', j['Head'], block('Head', -HEAD_W / 2, HEAD_W / 2, -HEAD_D / 2, HEAD_D / 2, HEAD_Z0, HEAD_Z1, m_skin, col))


def build_blocky_face(b, j, model, m_eye, m_shine):
    col = b.col
    eye_z0, eye_z1 = HEAD_Z0 + 3 * PX, HEAD_Z0 + 4.75 * PX
    for side, sx in (('L', 1), ('R', -1)):
        x0, x1 = sorted((sx * 1 * PX, sx * 2.5 * PX))
        parts = [block(f'Eye{side}Block', x0, x1, FACE_Y - RAISE, FACE_Y + 0.01, eye_z0, eye_z1, m_eye, col, bevel=0.004)]
        # Glanzpunkt oben innen
        gx = x0 + 0.012 if sx > 0 else x1 - 0.032
        parts.append(block(f'Eye{side}Shine', gx, gx + 0.02, FACE_Y - RAISE - 0.004, FACE_Y - RAISE + 0.004, eye_z1 - 0.034, eye_z1 - 0.012, m_shine, col, bevel=0))
        if model == 'female':
            # Wimpern: Lidstrich über dem Auge, außen einen halben Pixel länger
            lx0, lx1 = (x0, x1 + 0.5 * PX) if sx > 0 else (x0 - 0.5 * PX, x1)
            parts.append(block(f'Lash{side}', lx0, lx1, FACE_Y - RAISE, FACE_Y + 0.01, eye_z1 - 0.004, eye_z1 + 0.3 * PX, m_eye, col, bevel=0))
        eye = join(parts, f'Eye{side}')
        bpy.context.scene.cursor.location = ((x0 + x1) / 2, FACE_Y, (eye_z0 + eye_z1) / 2)
        bpy.ops.object.select_all(action='DESELECT')
        eye.select_set(True)
        bpy.context.view_layer.objects.active = eye
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        bpy.context.scene.cursor.location = (0, 0, 0)
        parent_to(eye, j['Head'])
    # Lächeln: Balken + hochgezogene Mundwinkel
    mz = HEAD_Z0 + 1.25 * PX
    b.add('HeadMesh', j['Head'], block('Mouth', -1 * PX, 1 * PX, FACE_Y - RAISE, FACE_Y + 0.01, mz, mz + 0.5 * PX, m_eye, col, bevel=0))
    for sx in (1, -1):
        x0, x1 = sorted((sx * 1 * PX, sx * 1.6 * PX))
        b.add('HeadMesh', j['Head'], block(f'MouthCorner{sx}', x0, x1, FACE_Y - RAISE, FACE_Y + 0.01, mz + 0.25 * PX, mz + 1 * PX, m_eye, col, bevel=0))
    m_cheek = material(f'{model}-cheek', '#f08a7a', 0.6)
    for sx in (1, -1):
        x0, x1 = sorted((sx * 2.4 * PX, sx * 3.4 * PX))
        b.add('HeadMesh', j['Head'], block(f'Cheek{sx}', x0, x1, FACE_Y - RAISE / 2, FACE_Y + 0.01, mz + 0.6 * PX, mz + 1.3 * PX, m_cheek, col, bevel=0))


def build_blocky_hair(b, j, style, m_hair):
    col = b.col
    g = 0.012                       # Haar liegt etwas über dem Kopf
    w, d = HEAD_W / 2 + g, HEAD_D / 2 + g
    top = HEAD_Z1 + 1 * PX
    head = j['Head']
    # Kappe oben, Hinterkopf, Schläfen
    b.add('HairTopMesh', head, block('HairCap', -w, w, -d, d, HEAD_Z1 - 0.01, top, m_hair, col))
    b.add('HairTopMesh', head, block('HairFringe', -w, w, -d, -d + 1.2 * PX, HEAD_Z1 - 1.25 * PX, HEAD_Z1, m_hair, col))
    for sx in (1, -1):
        x0, x1 = sorted((sx * (HEAD_W / 2 - 0.004), sx * w))
        b.add('HairTopMesh', head, block(f'HairTemple{sx}', x0, x1, -d, d, HEAD_Z1 - 3 * PX, HEAD_Z1, m_hair, col))
    if style == 'short':
        # Seitenscheitel: Stufe im Pony
        b.add('HairTopMesh', head, block('HairPart', 0.5 * PX, w, -d, -d + 1.2 * PX, HEAD_Z1 - 2 * PX, HEAD_Z1 - 1 * PX, m_hair, col))
        b.add('HairBackMesh', head, block('HairBack', -w, w, HEAD_D / 2 - 0.004, d, HEAD_Z0 + 3 * PX, HEAD_Z1, m_hair, col))
    elif style == 'long':
        # Lange Haare: Hinterkopf bis auf den Rücken, unten 45°-Schräge zum Oberkörper (druckt ohne Stütze)
        b.add('HairBackMesh', head, block('HairBack', -w, w, HEAD_D / 2 - 0.004, d, HEAD_Z0, HEAD_Z1, m_hair, col))
        b.add('HairBackMesh', head, wedge('HairNeck', -w + 0.01, w - 0.01, TORSO_D / 2 - 0.004, d, TORSO_Z1 - 3 * PX, HEAD_Z0 + 0.004, m_hair, col))
        for sx in (1, -1):
            x0, x1 = sorted((sx * (HEAD_W / 2 - 0.004), sx * w))
            b.add('HairBackMesh', head, block(f'HairSide{sx}', x0, x1, -d + 1 * PX, d, HEAD_Z0 + 0.5 * PX, HEAD_Z1, m_hair, col))
    elif style == 'bun':
        b.add('HairBackMesh', head, block('HairBack', -w, w, HEAD_D / 2 - 0.004, d, HEAD_Z0 + 2 * PX, HEAD_Z1, m_hair, col))
        b.add('HairTopMesh', head, block('Bun', -1.5 * PX, 1.5 * PX, -1 * PX, 2 * PX, top - 0.004, top + 2 * PX, m_hair, col))
        b.add('HairTopMesh', head, block('BunBand', -1.7 * PX, 1.7 * PX, -1.2 * PX, 2.2 * PX, top - 0.004, top + 0.6 * PX, material('diverse-band', '#f2cd37', 0.3), col))


def build_blocky_character(name, shirt, pants, hair, hair_style, clips=True):
    col = collection(f'character-blocky-{name}')
    m_skin = material(f'{name}-skin', SKIN, 0.45)
    m_shirt = material(f'{name}-shirt', shirt)
    m_pants = material(f'{name}-pants', pants)
    m_hair = material(f'{name}-hair', hair, 0.45)
    m_shoe = material('shoe', '#2b2b2b', 0.5)
    m_eye = material('eye', EYE, 0.15)
    m_shine = material('eye-shine', '#ffffff', 0.1)
    root = empty(f'character-{name}', (0, 0, 0), col)
    j = skeleton('', col, root)
    b = Builder(col)
    build_blocky_body(b, j, m_skin, m_shirt, m_pants, m_shoe)
    build_blocky_face(b, j, name, m_eye, m_shine)
    build_blocky_hair(b, j, hair_style, m_hair)
    b.finish()
    if clips:
        build_clips(j)
    return col, root


FIGURES = (
    ('male', '#0055bf', '#3a3a3a', '#5b3a1e', 'short'),
    ('female', '#c91a09', '#1f3b70', '#b98a3e', 'long'),
    ('diverse', '#237841', '#c9b48a', '#6b2f86', 'bun'),
)


# ---------------------------------------------------------------------------
# Druck (wie export_print.py: alle Teile vereinigen, Noppenloch mit Druckmaßen)

def boolean(obj, operation, operand, self_union=False):
    mod = obj.modifiers.new(operation, 'BOOLEAN')
    mod.operation = operation
    mod.solver = 'EXACT'
    mod.object = operand
    mod.use_self = self_union
    mod.use_hole_tolerant = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(operand)


def print_cylinder(radius, depth, x, y, z):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=radius, radius2=radius, depth=depth)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(x, y, z + depth / 2))
    mesh = bpy.data.meshes.new('cyl')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('cyl', mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def export_print(name, col):
    bm = bmesh.new()
    for obj in [o for o in col.all_objects if o.type == 'MESH']:
        part = bmesh.new()
        part.from_mesh(obj.data)
        part.transform(obj.matrix_world)
        tmp = bpy.data.meshes.new('tmp')
        part.to_mesh(tmp)
        part.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    mesh = bpy.data.meshes.new(f'print-{name}')
    bm.to_mesh(mesh)
    bm.free()
    body = bpy.data.objects.new(f'print-{name}', mesh)
    bpy.context.scene.collection.objects.link(body)
    boolean(body, 'UNION', bpy.data.objects.new('none', bpy.data.meshes.new('none')), self_union=True)
    # Noppenlöcher an die gedruckten Noppen anpassen (Ø 4,9 mm, 1,9 mm tief)
    for sx in (1, -1):
        boolean(body, 'DIFFERENCE', print_cylinder(4.9 / MM / 2, 1.9 / MM + 0.002, sx * LEG_X, 0, -0.002))
    bm = bmesh.new()
    bm.from_mesh(body.data)
    open_edges = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    path = os.path.join(PRINT_OUT, f'klonk-klotz-{name}.stl')
    bpy.ops.wm.stl_export(filepath=path, export_selected_objects=True, global_scale=MM, apply_modifiers=True)
    print(f'[klonk] {name}: {path} – {[round(v * MM, 1) for v in body.dimensions]} mm, offene Kanten: {open_edges}')
    bpy.data.objects.remove(body)


def compare_preview(old, new):
    """Bisherige Figuren (oben) und Klötzchen-Figuren (unten) nebeneinander"""
    scene = bpy.data.scenes.new('Compare')
    for i, col in enumerate(old + new):
        inst = bpy.data.objects.new(f'inst-{col.name}', None)
        inst.instance_type = 'COLLECTION'
        inst.instance_collection = col
        inst.location = ((i % 3) * 1.1 + (3.8 if i >= 3 else 0), 0, 0)
        inst.rotation_euler = (0, 0, math.radians(-25))
        scene.collection.objects.link(inst)
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.5
    sun.rotation_euler = (0.7, 0.2, 0.6)
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new('CompareWorld')
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.9, 0.92, 0.95, 1)
    scene.world = world
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 7.6
    cam.location = (3.0, -10, 0.68)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 560
    scene.render.filepath = os.path.join(HERE, 'preview-blocky.png')
    bpy.ops.render.render(write_still=True, scene=scene.name)


def main():
    reset_scene()
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PRINT_OUT, exist_ok=True)
    # Druckvorlagen in Ruhehaltung (ohne Animationen)
    for name, shirt, pants, hair, style in FIGURES:
        col, _ = build_blocky_character(name, shirt, pants, hair, style, clips=False)
        bpy.context.view_layer.update()
        export_print(name, col)
        for obj in list(col.all_objects):
            bpy.data.objects.remove(obj)
        bpy.data.collections.remove(col)

    new = []
    for name, shirt, pants, hair, style in FIGURES:
        col, _ = build_blocky_character(name, shirt, pants, hair, style)
        export([col], f'character-blocky-{name}.glb', animations=True)
        rename_exported(col, f'blocky-{name}')
        new.append(col)
    # Bisherige Figuren nur für den Vergleich (Gelenke wie im Original)
    exec(compile(source, 'build_models.py', 'exec'), old_ns := {'__file__': ns['__file__'], '__name__': 'klonk_old'})
    old_ns['build_clips'] = lambda joints: None
    old = []
    for name, shirt, pants, hair, style in FIGURES:
        col, _ = old_ns['build_character'](name, shirt, pants, hair, style)
        rename_exported(col, f'old-{name}')
        old.append(col)
    compare_preview(old, new)
    print('[klonk] Klötzchen-Figuren exportiert nach', OUT)


main()
