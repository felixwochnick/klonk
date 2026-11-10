"""
Erzeugt die Standard-3D-Modelle von Klonk in Klemmbaustein-Optik und exportiert sie als glTF (.glb).

    blender -b --factory-startup --python assets/blender/build_models.py

Ergebnis:
  apps/app/public/models/*.glb       – Modelle für die 3D-Welt (three.js)
      brick/plate/tile               – Bauteile der Welt (weiß, three.js färbt ein)
      character-<modell>             – Figuren mit Gelenken und Animationen (Clips, siehe CLIPS)
      outfits                        – Skins (Kleidung) und Zubehör, je Teil an ein Gelenk gehängt
  assets/blender/klonk-models.blend  – Quelldatei zum Weiterbearbeiten
  assets/blender/preview.png         – Vorschau aller Modelle, Skins und Zubehörteile

Maße: 1 Feld = 1 Einheit = 4×4 Noppen (Raster 0,25). Ein Ziegel ist 0,3 hoch (Verhältnis 9,6 mm : 8 mm),
eine Platte 0,1, eine Noppe 0,05 (Radius 0,075). Die Figuren sind in Weltmaßen gebaut (keine Skalierung):
jeder Fuß ist 1×2 Noppen groß und hat unten zwei Noppenlöcher – die Figur steckt mittig auf dem Feld auf
den vier inneren Noppen (x = ±0,125, Tiefe ±0,125).
glTF ist Y-oben; Blender-„vorne“ (-Y) wird in three.js zu +Z. Ursprung jedes Modells: Mitte der Unterseite.

Gelenke (Empties, in Ruhe ohne Drehung): Hips, Body (Oberkörper, Kopf, Arme), Head, ArmL/ArmR, HandL/HandR,
LegL/LegR, Augen EyeL/EyeR (Blinzeln). Skins/Zubehör in outfits.glb hängen an Empties namens
`skin__<skin>__<Gelenk>` bzw. `acc__<zubehör>__<Gelenk>` an derselben Ruheposition – three.js hängt deren
Kinder unverändert an das gleichnamige Gelenk der Figur (apps/app/app/utils/character-look.ts).
Materialien: `<modell>-skin|shirt|pants|hair`, `eye` werden per Design umgefärbt, ebenso `outfit-main-*`
(Farbe des Skins) und `acc-main-*` (Farbe des Zubehörs).
"""
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'app', 'public', 'models')

PITCH = 0.25         # Noppenraster
STUDS = 4            # Noppen pro Feld und Richtung
BRICK_H = 1.2 * PITCH
PLATE_H = 0.4 * PITCH
GAP = 0.005          # Fuge zwischen Nachbarsteinen
STUD_R = 0.3 * PITCH
STUD_H = 0.2 * PITCH
FPS = 24

# ---------------------------------------------------------------------------
# Maße der Figur (Blender-Koordinaten, Z oben, vorne = -Y)

FOOT_H = 0.12
LEG_X = PITCH / 2            # Beine über den inneren Noppen
HIP_Z = 0.42
HIP_Y = -0.02                # Beine mittig über dem Fuß (Schienbein bei y = 0)
TORSO_Z0, TORSO_Z1 = 0.50, 0.86
TORSO_W0, TORSO_W1 = 2 * PITCH - 0.01, 0.38   # unten zwei Noppen breit, oben schmaler
TORSO_D = 0.24
NECK_Z = 0.88
HEAD_Z0, HEAD_Z1 = 0.90, 1.16
HEAD_R = 0.15
# Arme: Schultergelenk oben an der Seite des Oberkörpers, Arm hängt leicht abgespreizt außen am Trapez
SHOULDER = Vector((0.19, 0, 0.815))
ARM_TILT = math.radians(12)         # nach außen abgespreizt (folgt der Trapezform)
ARM_OUT = 0.06                      # Armachse neben dem Gelenk
UPPER_LEN = 0.19
FOREARM_ANGLE = math.radians(-55)   # Unterarm nach vorn geknickt, Hände vor der Hüfte
FOREARM_LEN = 0.13
# Füße: je Fuß genau 1×1 Noppe mit einem Noppenloch in der Mitte. Die Figur ist um y = 0 gebaut; der Renderer
# setzt sie ½ Raster nach hinten, damit die Füße auf den inneren Noppen der hinteren Reihe stecken.
FOOT_Y0, FOOT_Y1 = -(PITCH - 0.012) / 2, (PITCH - 0.012) / 2
FOOT_HOLE_Y = 0.0
SHIN_D = 0.22
EYE_Z = 1.05


def torso_width(z):
    return TORSO_W0 + (TORSO_W1 - TORSO_W0) * (z - TORSO_Z0) / (TORSO_Z1 - TORSO_Z0)


# ---------------------------------------------------------------------------
# Hilfsfunktionen

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = FPS
    scene.frame_current = 0


def srgb_to_linear(hex_color):
    def channel(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    h = hex_color.lstrip('#')
    return tuple(channel(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def material(name, color, roughness=0.3, metallic=0.0, alpha=1.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(color), 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        mat.surface_render_method = 'BLENDED'
    return mat


def collection(name, parent=None):
    col = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(col)
    return col


class Builder:
    """Sammelt Teile je Gelenk, damit sie am Ende zu wenigen Meshes verschmolzen werden"""

    def __init__(self, col):
        self.col = col
        self.parts = {}     # Mesh-Name -> (Gelenk, [Objekte])

    def add(self, mesh_name, joint, obj):
        self.parts.setdefault(mesh_name, (joint, []))[1].append(obj)
        return obj

    def finish(self):
        for mesh_name, (joint, objs) in self.parts.items():
            joined = join(objs, mesh_name)
            parent_to(joined, joint)


def new_object(name, bm, mat, col):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    mesh.materials.append(mat)
    col.objects.link(obj)
    return obj


def box(name, size, location, mat, col, bevel=0.02, rotation=(0, 0, 0), center=False, taper=None, segments=3):
    """Quader mit abgerundeten Kanten; `location` = Mitte der Unterseite (bzw. Mitte bei `center`).
    `taper` = (Breite oben, Tiefe oben) relativ zur Grundfläche (Trapez, z. B. Oberkörper)."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        top = v.co.z > 0
        v.co.x *= sx * (taper[0] if taper and top else 1)
        v.co.y *= sy * (taper[1] if taper and top else 1)
        v.co.z = v.co.z * sz if center else (v.co.z + 0.5) * sz
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) / 3), segments=segments, affect='EDGES', profile=0.5)
    obj = new_object(name, bm, mat, col)
    obj.location = location
    obj.rotation_euler = rotation
    smooth(obj)
    return obj


def cylinder(name, radius, depth, location, mat, col, rotation=(0, 0, 0), vertices=32, radius2=None, bevel=0.0, scale=(1, 1, 1), bevel_segments=3, top_only=False):
    """Zylinder/Kegel; `location` = Mitte der Unterseite (entlang der lokalen Z-Achse)"""
    bm = bmesh.new()
    r2 = radius if radius2 is None else radius2
    bmesh.ops.create_cone(bm, cap_ends=True, segments=vertices, radius1=radius, radius2=r2, depth=depth)
    for v in bm.verts:
        v.co.z += depth / 2
        v.co.x *= scale[0]
        v.co.y *= scale[1]
    if bevel > 0:
        rims = [e for e in bm.edges if not e.is_manifold or len({round(v.co.z, 5) for v in e.verts}) == 1]
        rims = [e for e in rims if (abs(e.verts[0].co.z) < 1e-5 and not top_only) or abs(e.verts[0].co.z - depth) < 1e-5]
        bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=bevel_segments, affect='EDGES', profile=0.5)
    obj = new_object(name, bm, mat, col)
    obj.location = location
    obj.rotation_euler = rotation
    smooth(obj, sharp=False)
    return obj


def sphere(name, radius, location, mat, col, scale=(1, 1, 1), half=False, segments=32):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=segments // 2, radius=radius)
    if half:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-5], context='VERTS')
        bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    for v in bm.verts:
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
    obj = new_object(name, bm, mat, col)
    obj.location = location
    smooth(obj, sharp=False)
    return obj


def torus(name, major, minor, location, mat, col, rotation=(0, 0, 0), keep=None, segments=40):
    """Ring; `keep(x, y)` behält nur einen Teil (Bogen), offene Enden werden geschlossen"""
    bm = bmesh.new()
    seg_minor = 12
    rings = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        ring = []
        for j in range(seg_minor):
            b = 2 * math.pi * j / seg_minor
            r = major + minor * math.cos(b)
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), minor * math.sin(b))))
        rings.append(ring)
    for i in range(segments):
        a0, a1 = rings[i], rings[(i + 1) % segments]
        for j in range(seg_minor):
            bm.faces.new((a0[j], a1[j], a1[(j + 1) % seg_minor], a0[(j + 1) % seg_minor]))
    if keep:
        doomed = [v for v in bm.verts if not keep(v.co.x, v.co.y)]
        bmesh.ops.delete(bm, geom=doomed, context='VERTS')
        bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bm.normal_update()
    obj = new_object(name, bm, mat, col)
    obj.location = location
    obj.rotation_euler = rotation
    smooth(obj, sharp=False)
    return obj


def c_ring(name, major, minor, gap, gap_center, location, mat, col, rotation=(0, 0, 0), segments=28, sides=14):
    """C-förmiger Greifring (Bogen mit runden Enden); Lücke `gap` (Bogenmaß) zentriert bei Winkel `gap_center` in der XY-Ebene"""
    bm = bmesh.new()
    a0 = gap_center + gap / 2
    span = 2 * math.pi - gap
    rings = []
    for i in range(segments + 1):
        a = a0 + span * i / segments
        ring = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            r = major + minor * math.cos(b)
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), minor * math.sin(b))))
        rings.append(ring)
    for i in range(segments):
        for j in range(sides):
            bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % sides], rings[i][(j + 1) % sides]))
    # Enden mit Halbkugeln abrunden
    for end, sign in ((0, -1), (segments, 1)):
        a = a0 + span * end / segments
        center = Vector((major * math.cos(a), major * math.sin(a), 0))
        tangent = Vector((-math.sin(a), math.cos(a), 0)) * sign
        prev = rings[end]
        for k in range(1, 4):
            t = k / 4 * math.pi / 2
            ring = []
            for j in range(sides):
                base = rings[end][j].co - center
                ring.append(bm.verts.new(center + base * math.cos(t) + tangent * minor * math.sin(t)))
            for j in range(sides):
                f = (prev[j], ring[j], ring[(j + 1) % sides], prev[(j + 1) % sides])
                bm.faces.new(f if sign > 0 else f[::-1])
            prev = ring
        tip = bm.verts.new(center + tangent * minor)
        for j in range(sides):
            f = (prev[j], tip, prev[(j + 1) % sides])
            bm.faces.new(f if sign > 0 else f[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    obj = new_object(name, bm, mat, col)
    obj.location = location
    obj.rotation_euler = rotation
    smooth(obj, sharp=False)
    return obj


def star(name, r_outer, r_inner, depth, location, mat, col, rotation=(0, 0, 0), points=5):
    bm = bmesh.new()
    top, bottom = [], []
    for i in range(points * 2):
        a = math.pi / 2 + math.pi * i / points
        r = r_outer if i % 2 == 0 else r_inner
        bottom.append(bm.verts.new((r * math.cos(a), r * math.sin(a), 0)))
        top.append(bm.verts.new((r * math.cos(a), r * math.sin(a), depth)))
    bm.faces.new(bottom[::-1])
    bm.faces.new(top)
    n = len(top)
    for i in range(n):
        bm.faces.new((bottom[i], bottom[(i + 1) % n], top[(i + 1) % n], top[i]))
    obj = new_object(name, bm, mat, col)
    obj.location = location
    obj.rotation_euler = rotation
    return obj


def smooth(obj, sharp=True):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if sharp:
        # Kanten trotzdem scharf halten
        mod = obj.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True


def cut(obj, cutter):
    """Boolesche Differenz sofort anwenden und das Schneidwerkzeug entfernen"""
    mod = obj.modifiers.new('Cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return obj


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def join(objects, name):
    """Objekte zu einem Mesh vereinen (weniger Draw-Calls in three.js)"""
    for obj in objects:
        apply_modifiers(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    # Transformation in die Geometrie, Ursprung bleibt in der Mitte der Figur
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    joined.name = name
    joined.data.name = name
    return joined


def empty(name, location, col, parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.06
    col.objects.link(obj)
    if parent:
        bpy.context.view_layer.update()
        obj.parent = parent
        obj.location = Vector(location) - parent.matrix_world.translation
    else:
        obj.location = location
    return obj


def parent_to(child, parent):
    """Kind an Gelenk hängen, ohne die Weltposition zu verändern"""
    bpy.context.view_layer.update()
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world


def stud_positions():
    offsets = [(i - (STUDS - 1) / 2) * PITCH for i in range(STUDS)]
    return [(x, y) for x in offsets for y in offsets]


# ---------------------------------------------------------------------------
# Bauteile der Welt (werden hundertfach instanziert – wenige Vertices)

def stud(name, location, mat, col):
    return cylinder(name, STUD_R, STUD_H, location, mat, col, vertices=20, bevel=0.007, bevel_segments=1, top_only=True)


def build_brick(white):
    col = collection('brick')
    size = 1 - 2 * GAP
    parts = [box('BrickBody', (size, size, BRICK_H - 0.005), (0, 0, 0), white, col, bevel=0.015, segments=2)]
    parts += [stud(f'BrickStud{i}', (x, y, BRICK_H - 0.005), white, col) for i, (x, y) in enumerate(stud_positions())]
    join(parts, 'brick')
    return col


def build_plate(white):
    col = collection('plate')
    size = 1 - 2 * GAP
    parts = [box('PlateBody', (size, size, PLATE_H), (0, 0, 0), white, col, bevel=0.012, segments=2)]
    parts += [stud(f'PlateStud{i}', (x, y, PLATE_H), white, col) for i, (x, y) in enumerate(stud_positions())]
    join(parts, 'plate')
    return col


def build_tile(white):
    # Glatte Fliese ohne Noppen (Platten-Höhe, deckt die Noppen ab) – Marke auf einem Feld
    col = collection('tile')
    size = 1 - 4 * GAP
    join([box('tile', (size, size, PLATE_H), (0, 0, 0), white, col, bevel=0.01, segments=2)], 'tile')
    return col


# ---------------------------------------------------------------------------
# Skelett: dieselben Gelenke für Figuren, Skins und Zubehör

JOINTS = {
    'Hips': (None, (0, HIP_Y, HIP_Z)),
    'LegL': ('Hips', (LEG_X, HIP_Y, HIP_Z)),
    'LegR': ('Hips', (-LEG_X, HIP_Y, HIP_Z)),
    'Body': ('Hips', (0, 0, TORSO_Z0)),
    'Head': ('Body', (0, 0, NECK_Z)),
    'ArmL': ('Body', tuple(SHOULDER)),
    'ArmR': ('Body', (-SHOULDER.x, SHOULDER.y, SHOULDER.z)),
}


def arm_frame(side):
    """Schultergelenk (Welt) und Abspreiz-Drehung eines Arms"""
    sx = 1 if side == 'L' else -1
    return Vector((sx * SHOULDER.x, SHOULDER.y, SHOULDER.z)), Matrix.Rotation(-sx * ARM_TILT, 3, 'Y')


def arm_point(side, local):
    """Punkt im Armraum (Schulter = Ursprung, Arm hängt entlang -Z) in Weltkoordinaten"""
    origin, tilt = arm_frame(side)
    return origin + tilt @ Vector(local)


def arm_centerline(side, samples=34):
    """Mittellinie eines Arms (Welt): gerade nach unten, weicher Knick am Ellbogen, Unterarm nach vorn"""
    sx = 1 if side == 'L' else -1
    top = Vector((sx * ARM_OUT, 0, 0.0))
    elbow = elbow_local(side)
    d = Vector((0, math.sin(FOREARM_ANGLE), -math.cos(FOREARM_ANGLE)))
    bend = 0.07
    e_in, e_out = elbow + Vector((0, 0, bend)), elbow + d * bend
    end = elbow + d * FOREARM_LEN
    pts = []
    n1, n2, n3 = 10, 12, 12
    for i in range(n1):
        pts.append(top.lerp(e_in, i / n1))
    for i in range(n2):
        t = i / n2
        pts.append(e_in * (1 - t) ** 2 + elbow * 2 * t * (1 - t) + e_out * t * t)
    for i in range(n3 + 1):
        pts.append(e_out.lerp(end, i / n3))
    return [arm_point(side, p) for p in pts]


def tube(name, points, half_widths, mat, col, cap_start=0.0, cap_end=0.0, sides=24, power=4.0):
    """Schlauch mit abgerundet-eckigem Querschnitt entlang `points` (Seitenachse = Welt-X, gekippt mit dem Arm).
    `half_widths(t)` liefert (Breite/2 seitlich, Tiefe/2) für t ∈ [0, 1]; Kappen als Kuppel mit der angegebenen Höhe."""
    bm = bmesh.new()
    n = len(points)
    lengths = [0.0]
    for i in range(1, n):
        lengths.append(lengths[-1] + (points[i] - points[i - 1]).length)
    total = lengths[-1]
    rings, frames = [], []
    for i, p in enumerate(points):
        tangent = (points[min(i + 1, n - 1)] - points[max(i - 1, 0)]).normalized()
        side_axis = Vector((1, 0, 0))
        side_axis = (side_axis - tangent * side_axis.dot(tangent)).normalized()
        normal = tangent.cross(side_axis)
        a, b = half_widths(lengths[i] / total)
        frames.append((p, tangent, side_axis, normal, a, b))

    def section(p, side_axis, normal, a, b, scale=1.0):
        ring = []
        for j in range(sides):
            th = 2 * math.pi * j / sides
            c, s_ = math.cos(th), math.sin(th)
            x = a * scale * math.copysign(abs(c) ** (2 / power), c)
            y = b * scale * math.copysign(abs(s_) ** (2 / power), s_)
            ring.append(bm.verts.new(p + side_axis * x + normal * y))
        return ring

    for p, t, sa, nm, a, b in frames:
        rings.append(section(p, sa, nm, a, b))

    def cap(base_frame, direction, height, at_start):
        p, t, sa, nm, a, b = base_frame
        prev = rings[0] if at_start else rings[-1]
        steps = 5
        out = []
        for k in range(1, steps + 1):
            ang = k / steps * math.pi / 2
            ring = section(p + direction * height * math.sin(ang), sa, nm, a, b, max(math.cos(ang), 0.0001))
            out.append((prev, ring))
            prev = ring
        tip = bm.verts.new(p + direction * height)
        return out, prev, tip

    def connect(r0, r1, flip=False):
        for j in range(sides):
            f = (r0[j], r1[j], r1[(j + 1) % sides], r0[(j + 1) % sides])
            bm.faces.new(f[::-1] if flip else f)

    for i in range(n - 1):
        connect(rings[i], rings[i + 1])
    for at_start, height in ((True, cap_start), (False, cap_end)):
        frame = frames[0] if at_start else frames[-1]
        direction = -frame[1] if at_start else frame[1]
        if height > 0:
            pairs, last, tip = cap(frame, direction, height, at_start)
            for r0, r1 in pairs:
                connect(r0, r1, flip=at_start)
            for j in range(sides):
                f = (last[j], tip, last[(j + 1) % sides])
                bm.faces.new(f[::-1] if not at_start else f)
        else:
            ring = rings[0] if at_start else rings[-1]
            bm.faces.new(ring[::-1] if at_start else ring)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    obj = new_object(name, bm, mat, col)
    smooth(obj, sharp=False)
    return obj


def arm_widths(grow=0.0):
    # Oberarm 0,1 breit und 0,115 tief, zum Handgelenk etwas schmaler
    return lambda t: (0.05 - 0.007 * t + grow, 0.058 - 0.008 * t + grow)


def arm_part(name, side, mat, col, t0=0.0, t1=1.0, grow=0.0, cap_start=0.0, cap_end=0.0):
    """Teilstück des Arms (t0–t1 entlang der Mittellinie) als ein Mesh, z. B. ganzer Arm, Ärmel oder Manschette"""
    pts = arm_centerline(side)
    i0, i1 = round(t0 * (len(pts) - 1)), round(t1 * (len(pts) - 1))
    sub = pts[i0:i1 + 1]
    full = arm_widths(grow)
    span = (i0 / (len(pts) - 1), i1 / (len(pts) - 1))
    return tube(name, sub, lambda t: full(span[0] + (span[1] - span[0]) * t), mat, col, cap_start=cap_start, cap_end=cap_end)


def frame_euler(axis, gap_dir):
    """Drehung, die lokal Z auf `axis` und lokal -X auf `gap_dir` legt (für c_ring mit gap_center = π)"""
    z = Vector(axis).normalized()
    g = Vector(gap_dir)
    g = (g - z * g.dot(z)).normalized()
    x = -g
    y = z.cross(x)
    return tuple(Matrix((x, y, z)).transposed().to_euler())


def arm_rot(side, euler=(0, 0, 0)):
    _, tilt = arm_frame(side)
    return tuple((tilt @ Euler(euler).to_matrix()).to_euler())


def forearm_dir(side):
    _, tilt = arm_frame(side)
    return tilt @ Vector((0, math.sin(FOREARM_ANGLE), -math.cos(FOREARM_ANGLE)))


def elbow_local(side):
    return Vector(((1 if side == 'L' else -1) * ARM_OUT, 0, -UPPER_LEN))


def wrist(side):
    """Ellbogen und Handgelenk in Weltkoordinaten"""
    elbow = arm_point(side, elbow_local(side))
    return elbow, elbow + forearm_dir(side) * FOREARM_LEN


JOINTS['HandL'] = ('ArmL', tuple(wrist('L')[1]))
JOINTS['HandR'] = ('ArmR', tuple(wrist('R')[1]))


def skeleton(prefix, col, root=None):
    """Gelenk-Empties anlegen; `prefix` z. B. '' (Figur) oder 'skin__worker__' (Skin)"""
    joints = {}
    for name, (parent, location) in JOINTS.items():
        joints[name] = empty(prefix + name, location, col, joints[parent] if parent else root)
    return joints


# ---------------------------------------------------------------------------
# Figuren (Klemmbaustein-Figur: Noppenkopf, Trapez-Oberkörper, Greifhände, Beine mit Noppenlöchern)

SKIN = '#e8b48a'
EYE = '#1b1b1b'


def build_body(b, j, m_skin, m_shirt, m_pants):
    col = b.col
    # Beine: Fuß 1×1 Noppe mit einem Noppenloch (steckt auf genau einer Noppe), Bein darüber, runde Hüftachse
    for side, sx in (('L', 1), ('R', -1)):
        x = sx * LEG_X
        foot = box(f'Foot{side}', (PITCH - 0.012, FOOT_Y1 - FOOT_Y0, FOOT_H), (x, (FOOT_Y0 + FOOT_Y1) / 2, 0), m_pants, col, bevel=0.018)
        cut(foot, cylinder(f'Hole{side}', STUD_R + 0.003, STUD_H + 0.004, (x, FOOT_HOLE_Y, -0.002), m_pants, col))
        b.add(f'Leg{side}Mesh', j[f'Leg{side}'], foot)
        b.add(f'Leg{side}Mesh', j[f'Leg{side}'], box(f'Shin{side}', (PITCH - 0.02, SHIN_D, HIP_Z - FOOT_H), (x, HIP_Y + 0.02, FOOT_H - 0.01), m_pants, col, bevel=0.02))
        b.add(f'Leg{side}Mesh', j[f'Leg{side}'], cylinder(f'HipAxle{side}', 0.075, PITCH - 0.02, (x - (PITCH - 0.02) / 2, HIP_Y + 0.02, HIP_Z), m_pants, col, rotation=(0, math.pi / 2, 0), bevel=0.01))

    # Hüftstück
    b.add('HipsMesh', j['Hips'], box('Hips', (2 * PITCH - 0.01, 0.25, 0.08), (0, HIP_Y, HIP_Z), m_pants, col, bevel=0.02))
    b.add('HipsMesh', j['Hips'], box('HipJoint', (0.08, 0.2, 0.05), (0, HIP_Y, HIP_Z - 0.04), m_pants, col, bevel=0.015))

    # Oberkörper (Trapez), Hals
    taper = (TORSO_W1 / TORSO_W0, 1.0)
    b.add('BodyMesh', j['Body'], box('Torso', (TORSO_W0, TORSO_D, TORSO_Z1 - TORSO_Z0), (0, 0, TORSO_Z0), m_shirt, col, bevel=0.025, taper=taper))
    b.add('BodyMesh', j['Body'], cylinder('Neck', 0.065, NECK_Z - TORSO_Z1 + 0.03, (0, 0, TORSO_Z1 - 0.01), m_skin, col))

    # Kopf: Zylinder mit Noppe obendrauf
    b.add('HeadMesh', j['Head'], cylinder('Head', HEAD_R, HEAD_Z1 - HEAD_Z0, (0, 0, HEAD_Z0), m_skin, col, bevel=0.035, vertices=48))
    # Kopfnoppe gehört zur Frisur oben (HairTop), damit Kopfbedeckungen sie mit ausblenden
    b.add('HairTopMesh', j['Head'], cylinder('HeadStud', 0.085, 0.06, (0, 0, HEAD_Z1 - 0.005), m_skin, col, bevel=0.01))

    # Arme: Oberarm, nach vorn geneigter Unterarm, C-Greifhand
    for side, sx in (('L', 1), ('R', -1)):
        elbow, hand = wrist(side)
        d = forearm_dir(side)
        arm = f'Arm{side}Mesh'
        # Arm aus einem Stück: Schulterkuppe, Oberarm, weicher Knick am Ellbogen, Unterarm
        b.add(arm, j[f'Arm{side}'], arm_part(f'ArmTube{side}', side, m_shirt, col, cap_start=0.05, cap_end=0.012))
        b.add(arm, j[f'Arm{side}'], cylinder(f'ShoulderPin{side}', 0.04, 0.05, tuple(arm_point(side, (sx * 0.02, 0, -0.02))), m_shirt, col, rotation=arm_rot(side, (0, -sx * math.pi / 2, 0))))
        # Hand wie bei Klemmbaustein-Figuren: C-Clip, Zapfen hinten am geschlossenen Teil, Öffnung gegenüber
        h = f'Hand{side}Mesh'
        # Loch quer zum Unterarm (nach oben/vorn), Öffnung zeigt vom Handgelenk weg (vom User so gewählt)
        _, tilt = arm_frame(side)
        axis = tilt @ Vector((0, -math.cos(FOREARM_ANGLE), -math.sin(FOREARM_ANGLE)))
        gap_dir = d
        major, minor = 0.04, 0.026
        b.add(h, j[f'Hand{side}'], cylinder(f'Wrist{side}', 0.026, 0.05, tuple(hand - d * 0.015), m_skin, col, rotation=arm_rot(side, (FOREARM_ANGLE + math.pi, 0, 0))))
        grip = hand + d * (0.03 + major + minor * 0.6)
        b.add(h, j[f'Hand{side}'], c_ring(f'Grip{side}', major, minor, math.radians(75), math.pi, tuple(grip), m_skin, col, rotation=frame_euler(axis, gap_dir)))


def build_face(b, j, model, m_eye, m_shine):
    col = b.col
    for side, sx in (('L', 1), ('R', -1)):
        x = sx * 0.055
        theta = math.asin(x / HEAD_R)
        r = HEAD_R - 0.004
        location = (r * math.sin(theta), -r * math.cos(theta), EYE_Z)
        rot = (math.pi / 2, 0, theta)
        parts = [cylinder(f'Eye{side}Disc', 0.024, 0.012, location, m_eye, col, rotation=rot, scale=(1, 1.3, 1))]
        shine = Vector((-0.008 * sx, 0, 0.012))
        shine.rotate(Euler((0, 0, theta)))
        shine_loc = (location[0] + shine.x + 0.0115 * math.sin(theta), location[1] + shine.y - 0.0115 * math.cos(theta), location[2] + shine.z)
        parts.append(cylinder(f'Eye{side}Shine', 0.007, 0.004, shine_loc, m_shine, col, rotation=rot))
        if model == 'female':
            # Wimpern außen am Auge
            lash = Vector((0.026 * sx, 0, 0.026))
            lash.rotate(Euler((0, 0, theta)))
            parts.append(box(f'Lash{side}', (0.022, 0.012, 0.006), (location[0] + lash.x, location[1] + lash.y - 0.004, location[2] + lash.z), m_eye, col, bevel=0.002, rotation=(0, sx * 0.5, theta), center=True))
        eye = join(parts, f'Eye{side}')
        # Ursprung in die Augenmitte (zum Blinzeln skalieren)
        bpy.context.scene.cursor.location = location
        bpy.ops.object.select_all(action='DESELECT')
        eye.select_set(True)
        bpy.context.view_layer.objects.active = eye
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        bpy.context.scene.cursor.location = (0, 0, 0)
        parent_to(eye, j['Head'])
    # Lächeln (untere Hälfte eines Rings)
    b.add('HeadMesh', j['Head'], torus('Smile', 0.055, 0.009, (0, -HEAD_R + 0.002, EYE_Z - 0.065), m_eye, col, rotation=(math.pi / 2, 0, 0), keep=lambda x, y: y < -0.012))
    # Wangen
    m_cheek = material(f'{model}-cheek', '#f08a7a', 0.6)
    for sx in (1, -1):
        x = sx * 0.09
        theta = math.asin(x / HEAD_R)
        r = HEAD_R - 0.004
        b.add('HeadMesh', j['Head'], cylinder(f'Cheek{sx}', 0.018, 0.008, (r * math.sin(theta), -r * math.cos(theta), EYE_Z - 0.045), m_cheek, col, rotation=(math.pi / 2, 0, theta), scale=(1.3, 1, 1)))


def hair_cap(b, j, m_hair, front_cut=1.1, name='HairTopMesh', stud=True):
    col = b.col
    cap = cylinder('HairCap', HEAD_R + 0.014, 0.16, (0, 0, 1.04), m_hair, col, bevel=0.06, vertices=48)
    cap.modifiers.clear()
    # Gesicht frei lassen (vorne unterhalb des Ponys) und innen hohl
    cut(cap, box('FaceCut', (0.5, 0.3, front_cut - 0.9), (0, -0.18, 0.9), m_hair, col, bevel=0))
    smooth(cap, sharp=False)
    b.add(name, j['Head'], cap)
    if stud:
        b.add(name, j['Head'], cylinder('HairStud', 0.088, 0.05, (0, 0, 1.19), m_hair, col, bevel=0.01))


def build_hair(b, j, style, m_hair):
    col = b.col
    if style == 'short':
        hair_cap(b, j, m_hair, front_cut=1.105)
        # Seitenscheitel: kleine Tolle vorne
        b.add('HairTopMesh', j['Head'], box('Quiff', (0.16, 0.08, 0.05), (0.04, -0.12, 1.15), m_hair, col, bevel=0.022, rotation=(0.3, 0, 0.15)))
    elif style == 'long':
        hair_cap(b, j, m_hair, front_cut=1.115)
        b.add('HairTopMesh', j['Head'], box('Fringe', (0.2, 0.06, 0.06), (-0.06, -0.135, 1.08), m_hair, col, bevel=0.025, rotation=(0, -0.35, 0)))
        # Lange Haare hinten bis auf die Schultern, Strähnen an den Seiten
        b.add('HairBackMesh', j['Head'], box('HairBack', (0.32, 0.1, 0.32), (0, 0.115, 0.82), m_hair, col, bevel=0.045))
        for sx in (1, -1):
            b.add('HairBackMesh', j['Head'], box(f'HairSide{sx}', (0.05, 0.2, 0.24), (sx * 0.152, 0.03, 0.85), m_hair, col, bevel=0.022))
    elif style == 'bun':
        hair_cap(b, j, m_hair, front_cut=1.1, stud=False)
        b.add('HairTopMesh', j['Head'], cylinder('BunBase', 0.092, 0.05, (0, 0.0, 1.18), m_hair, col))
        b.add('HairTopMesh', j['Head'], sphere('Bun', 0.085, (0, 0.02, 1.25), m_hair, col))
        b.add('HairTopMesh', j['Head'], torus('BunBand', 0.066, 0.012, (0, 0.02, 1.215), material('diverse-band', '#f2cd37', 0.3), col))


def build_character(name, shirt, pants, hair, hair_style):
    col = collection(f'character-{name}')
    m_skin = material(f'{name}-skin', SKIN, 0.45)
    m_shirt = material(f'{name}-shirt', shirt)
    m_pants = material(f'{name}-pants', pants)
    m_hair = material(f'{name}-hair', hair, 0.45)
    m_eye = material('eye', EYE, 0.15)
    m_shine = material('eye-shine', '#ffffff', 0.1)

    root = empty(f'character-{name}', (0, 0, 0), col)
    j = skeleton('', col, root)
    b = Builder(col)
    build_body(b, j, m_skin, m_shirt, m_pants)
    build_face(b, j, name, m_eye, m_shine)
    build_hair(b, j, hair_style, m_hair)
    b.finish()
    build_clips(j)
    return col, root


# ---------------------------------------------------------------------------
# Animationen (Clips). three.js spielt sie zeitlich gestreckt auf die Dauer des Weltereignisses ab.
# Werte: Drehung in Grad (Blender-Achsen, negatives X = nach vorn), Verschiebung in Einheiten.

def d(x=0, y=0, z=0):
    return {'rot': (x, y, z)}


CLIPS = {
    # Ein Schritt (ein Feld): Beine und Arme gegenläufig, Oberkörper wippt
    'Walk': (24, {
        'LegL': [(0, d()), (6, d(-32)), (12, d()), (18, d(30)), (24, d())],
        'LegR': [(0, d()), (6, d(30)), (12, d()), (18, d(-32)), (24, d())],
        'ArmL': [(0, d()), (6, d(28)), (12, d()), (18, d(-30)), (24, d())],
        'ArmR': [(0, d()), (6, d(-30)), (12, d()), (18, d(28)), (24, d())],
        'Body': [(0, {'loc': (0, 0, 0)}), (6, {'loc': (0, 0, 0.015)}), (12, {'loc': (0, 0, 0)}), (18, {'loc': (0, 0, 0.015)}), (24, {'loc': (0, 0, 0)})],
        'Head': [(0, d()), (6, d(0, 0, 4)), (18, d(0, 0, -4)), (24, d())],
    }),
    # Hochsteigen/Springen: in die Knie, Arme hoch, Beine anziehen
    'Climb': (24, {
        'LegL': [(0, d()), (5, d(-25)), (12, d(-55)), (19, d(-10)), (24, d())],
        'LegR': [(0, d()), (5, d(-25)), (12, d(-40)), (19, d(-5)), (24, d())],
        'ArmL': [(0, d()), (5, d(20)), (12, d(-150, 0, 10)), (19, d(-40)), (24, d())],
        'ArmR': [(0, d()), (5, d(20)), (12, d(-150, 0, -10)), (19, d(-40)), (24, d())],
        'Body': [(0, d()), (5, d(-12)), (12, d(5)), (24, d())],
    }),
    # Drehen auf der Stelle: zwei kleine Tippelschritte
    'Turn': (16, {
        'LegL': [(0, d()), (4, d(-20)), (8, d()), (16, d())],
        'LegR': [(0, d()), (8, d()), (12, d(-20)), (16, d())],
        'ArmL': [(0, d()), (4, d(0, 0, 0)), (8, d(-10, 0, 0)), (16, d())],
        'ArmR': [(0, d()), (8, d(-10)), (16, d())],
        'Head': [(0, d()), (5, d(0, 0, 15)), (16, d())],
    }),
    # Ziegel ablegen: beide Arme nach vorn, Oberkörper beugt sich vor
    'Place': (24, {
        'ArmL': [(0, d()), (8, d(-80)), (14, d(-60)), (24, d())],
        'ArmR': [(0, d()), (8, d(-80)), (14, d(-60)), (24, d())],
        'HandL': [(0, d()), (8, d(0, 30)), (16, d(0, 0)), (24, d())],
        'HandR': [(0, d()), (8, d(0, -30)), (16, d(0, 0)), (24, d())],
        'Body': [(0, d()), (9, d(-22)), (16, d(-12)), (24, d())],
        'Head': [(0, d()), (9, d(-10)), (24, d())],
    }),
    # Ziegel aufheben: vorbeugen, greifen, hochheben, zurück
    'Pick': (24, {
        'ArmL': [(0, d()), (7, d(-65)), (13, d(-65)), (18, d(-110)), (24, d())],
        'ArmR': [(0, d()), (7, d(-65)), (13, d(-65)), (18, d(-110)), (24, d())],
        'HandL': [(0, d()), (7, d(0, 30)), (13, d(0, 10)), (24, d())],
        'HandR': [(0, d()), (7, d(0, -30)), (13, d(0, -10)), (24, d())],
        'Body': [(0, d()), (7, d(-25)), (13, d(-25)), (18, d(4)), (24, d())],
        'Head': [(0, d()), (7, d(-12)), (18, d(6)), (24, d())],
    }),
    # Marke setzen/entfernen: rechtes Bein stampft, Arme schwingen aus
    'Mark': (24, {
        'LegR': [(0, d()), (7, d(-55)), (11, d(-55)), (14, d(4)), (24, d())],
        'LegL': [(0, d()), (7, d(6)), (14, d()), (24, d())],
        'ArmL': [(0, d()), (7, d(-20, 0, 25)), (14, d(10, 0, 10)), (24, d())],
        'ArmR': [(0, d()), (7, d(-20, 0, -25)), (14, d(10, 0, -10)), (24, d())],
        'Body': [(0, d()), (7, d(6)), (14, d(-8)), (24, d())],
        'Head': [(0, d()), (14, d(-15)), (24, d())],
    }),
    # Winken (neue Figur)
    'Wave': (36, {
        'ArmR': [(0, d()), (6, d(-160, 0, -15)), (30, d(-160, 0, -15)), (36, d())],
        'HandR': [(0, d()), (6, d()), (12, d(0, 35)), (18, d(0, -35)), (24, d(0, 35)), (30, d()), (36, d())],
        'Head': [(0, d()), (8, d(0, -8, -10)), (28, d(0, -8, -10)), (36, d())],
        'Body': [(0, d()), (8, d(0, 4, 0)), (28, d(0, 4, 0)), (36, d())],
    }),
    # Freuen (z. B. Aufgabe gelöst): Arme hoch, kleiner Sprung
    'Cheer': (30, {
        'ArmL': [(0, d()), (8, d(-170, 0, 20)), (15, d(-150, 0, 25)), (22, d(-170, 0, 20)), (30, d())],
        'ArmR': [(0, d()), (8, d(-170, 0, -20)), (15, d(-150, 0, -25)), (22, d(-170, 0, -20)), (30, d())],
        'Hips': [(0, {'loc': (0, 0, 0)}), (6, {'loc': (0, 0, -0.02)}), (12, {'loc': (0, 0, 0.12)}), (18, {'loc': (0, 0, 0)}), (30, {'loc': (0, 0, 0)})],
        'LegL': [(0, d()), (12, d(-20)), (18, d()), (30, d())],
        'LegR': [(0, d()), (12, d(-20)), (18, d()), (30, d())],
        'Head': [(0, d()), (12, d(12)), (24, d()), (30, d())],
    }),
    # Gegen ein Hindernis: zurückzucken, Kopf schütteln
    'Bump': (24, {
        'Body': [(0, d()), (4, d(12)), (10, d(4)), (24, d())],
        'Head': [(0, d()), (6, d(0, 0, 20)), (11, d(0, 0, -20)), (16, d(0, 0, 15)), (21, d()), (24, d())],
        'ArmL': [(0, d()), (4, d(-30, 0, 15)), (14, d(-30, 0, 15)), (24, d())],
        'ArmR': [(0, d()), (4, d(-30, 0, -15)), (14, d(-30, 0, -15)), (24, d())],
    }),
    # Im Stand (gelegentlich): umschauen, blinzeln, Arme lockern
    'Idle': (72, {
        'Head': [(0, d()), (12, d(0, 0, 25)), (26, d(0, 0, 25)), (38, d(-6, 0, -20)), (52, d(-6, 0, -20)), (64, d()), (72, d())],
        'EyeL': [(0, {'scale': (1, 1, 1)}), (30, {'scale': (1, 1, 1)}), (32, {'scale': (1, 0.1, 1)}), (34, {'scale': (1, 1, 1)}), (72, {'scale': (1, 1, 1)})],
        'EyeR': [(0, {'scale': (1, 1, 1)}), (30, {'scale': (1, 1, 1)}), (32, {'scale': (1, 0.1, 1)}), (34, {'scale': (1, 1, 1)}), (72, {'scale': (1, 1, 1)})],
        'ArmL': [(0, d()), (18, d(-8, 0, 6)), (40, d()), (72, d())],
        'ArmR': [(0, d()), (30, d(-6, 0, -6)), (56, d()), (72, d())],
        'HandL': [(0, d()), (18, d(0, 25)), (40, d()), (72, d())],
        'Body': [(0, d()), (36, d(0, 3, 0)), (72, d())],
    }),
}


def build_clips(joints):
    """Je Clip und Gelenk eine Action als NLA-Spur; der glTF-Export fasst gleichnamige Spuren zu einer Animation zusammen"""
    objects = dict(joints)
    head = joints['Head']
    for child in head.children:
        if child.name in ('EyeL', 'EyeR'):
            objects[child.name] = child
    for clip, (length, tracks) in CLIPS.items():
        for joint_name, keys in tracks.items():
            obj = objects[joint_name]
            base_loc = obj.location.copy()
            base_rot = obj.rotation_euler.copy()
            base_scale = obj.scale.copy()
            obj.animation_data_create()
            action = bpy.data.actions.new(f'{clip}-{obj.name}')
            obj.animation_data.action = action
            for frame, value in keys:
                if 'rot' in value or not value:
                    rx, ry, rz = value.get('rot', (0, 0, 0))
                    obj.rotation_euler = (base_rot.x + math.radians(rx), base_rot.y + math.radians(ry), base_rot.z + math.radians(rz))
                    obj.keyframe_insert('rotation_euler', frame=frame)
                if 'loc' in value:
                    obj.location = base_loc + Vector(value['loc'])
                    obj.keyframe_insert('location', frame=frame)
                if 'scale' in value:
                    obj.scale = value['scale']
                    obj.keyframe_insert('scale', frame=frame)
            # Clip-Länge festhalten (alle Spuren eines Clips gleich lang)
            if keys[-1][0] < length:
                obj.keyframe_insert('rotation_euler', frame=length)
            obj.location, obj.rotation_euler, obj.scale = base_loc, base_rot, base_scale
            track = obj.animation_data.nla_tracks.new()
            track.name = clip
            track.strips.new(clip, 0, action)
            track.mute = False
            obj.animation_data.action = None


# ---------------------------------------------------------------------------
# Skins (Kleidung über der Figur) – Teile je Gelenk, Hauptfarbe `outfit-main-<skin>` umfärbbar

def shell(name, z0, z1, grow, mat, col, y0=None, y1=None):
    """Hülle um den Oberkörper zwischen z0 und z1 (folgt der Trapezform), etwas größer als der Körper"""
    w0, w1 = torso_width(z0) + 2 * grow, torso_width(z1) + 2 * grow
    y0 = -TORSO_D / 2 - grow if y0 is None else y0
    y1 = TORSO_D / 2 + grow if y1 is None else y1
    obj = box(name, (w0, y1 - y0, z1 - z0), (0, (y0 + y1) / 2, z0), mat, col, bevel=min(0.02, (z1 - z0) / 3), taper=(w1 / w0, 1))
    return obj


def front(z, grow=0.0):
    """Y-Koordinate der Vorderseite des Oberkörpers"""
    return -TORSO_D / 2 - grow


def sleeves(o, mat, col, cuff=None):
    for side, sx in (('L', 1), ('R', -1)):
        elbow, _ = wrist(side)
        d = forearm_dir(side)
        o.add(f'Arm{side}', arm_part(f'Sleeve{side}', side, mat, col, grow=0.007, cap_start=0.055, cap_end=0.022))
        if cuff:
            o.add(f'Arm{side}', arm_part(f'Cuff{side}', side, cuff, col, t0=0.86, t1=0.97, grow=0.011, cap_start=0.003, cap_end=0.003))


def belt(o, mat, buckle, col, pouch=None):
    o.add('Hips', box('Belt', (2 * PITCH + 0.008, 0.268, 0.05), (0, HIP_Y, HIP_Z + 0.02), mat, col, bevel=0.012))
    o.add('Hips', box('Buckle', (0.07, 0.02, 0.04), (0, HIP_Y - 0.135, HIP_Z + 0.025), buckle, col, bevel=0.006))
    if pouch:
        o.add('Hips', box('Pouch', (0.07, 0.12, 0.09), (0.21, HIP_Y - 0.02, HIP_Z - 0.03), pouch, col, bevel=0.015))


class Outfit:
    def __init__(self, prefix, col):
        self.prefix = prefix
        self.col = col
        self.joints = skeleton(prefix, col)
        self.builder = Builder(col)

    def add(self, joint, obj):
        return self.builder.add(f'{self.prefix}{joint}Mesh', self.joints[joint], obj)

    def finish(self):
        self.builder.finish()
        # Leere Gelenke ohne Teile entfernen (kleinere Datei)
        for joint in reversed(list(self.joints.values())):
            if not joint.children:
                bpy.data.objects.remove(joint, do_unlink=True)


def skin_worker(o, col):
    vest = material('outfit-main-worker', '#ff7a1a', 0.35)
    reflect = material('outfit-reflect', '#e3e7ea', 0.15, 0.6)
    dark = material('outfit-dark', '#2a2a2a', 0.5)
    leather = material('outfit-leather', '#6b4423', 0.6)
    o.add('Body', shell('Vest', 0.52, 0.85, 0.012, vest, col))
    for z in (0.6, 0.69):
        o.add('Body', shell(f'Stripe{z}', z, z + 0.035, 0.02, reflect, col))
    # Schulterstreifen (vorne und hinten)
    for sx in (1, -1):
        o.add('Body', box(f'Strap{sx}', (0.04, TORSO_D + 0.05, 0.02), (sx * 0.11, 0, 0.845), reflect, col, bevel=0.006))
    o.add('Body', box('Zip', (0.012, 0.01, 0.31), (0, front(0) - 0.017, 0.53), dark, col, bevel=0.003))
    o.add('Body', box('Pocket', (0.08, 0.012, 0.06), (0.1, front(0) - 0.016, 0.76), vest, col, bevel=0.005))
    belt(o, leather, reflect, col, pouch=leather)
    # Zollstock im Beutel
    o.add('Hips', box('Ruler', (0.025, 0.04, 0.13), (0.21, HIP_Y - 0.04, HIP_Z - 0.01), material('outfit-ruler', '#f2cd37', 0.4), col, bevel=0.004))


def skin_doctor(o, col):
    coat = material('outfit-main-doctor', '#f4f4f4', 0.4)
    metal = material('outfit-metal', '#9aa3ab', 0.25, 0.7)
    dark = material('outfit-dark', '#2a2a2a', 0.5)
    shell_obj = shell('Coat', 0.5, 0.86, 0.012, coat, col)
    # V-Ausschnitt
    cut(shell_obj, box('VNeck', (0.15, 0.12, 0.15), (0, -0.13, 0.86), coat, col, bevel=0, rotation=(0, math.radians(45), 0), center=True))
    o.add('Body', shell_obj)
    o.add('Body', box('Placket', (0.012, 0.01, 0.2), (0, front(0) - 0.017, 0.5), dark, col, bevel=0.003))
    for sx in (1, -1):
        o.add('Body', box(f'CoatPocket{sx}', (0.09, 0.012, 0.07), (sx * 0.13, front(0) - 0.016, 0.54), coat, col, bevel=0.006))
    o.add('Body', box('PenPocket', (0.012, 0.014, 0.05), (-0.11, front(0) - 0.02, 0.73), material('outfit-pen', '#0055bf', 0.3), col, bevel=0.003))
    o.add('Hips', box('CoatHem', (2 * PITCH + 0.012, 0.27, 0.08), (0, HIP_Y, HIP_Z), coat, col, bevel=0.015))
    # Stethoskop um den Hals
    o.add('Body', torus('Stetho', 0.11, 0.008, (0, -0.02, 0.84), dark, col, rotation=(math.radians(70), 0, 0), keep=lambda x, y: y < 0.06))
    o.add('Body', cylinder('Chestpiece', 0.025, 0.012, (0.05, front(0) - 0.024, 0.66), metal, col, rotation=(math.pi / 2, 0, 0)))
    o.add('Body', box('Tube', (0.008, 0.008, 0.08), (0.05, front(0) - 0.022, 0.67), dark, col, bevel=0.002))
    sleeves(o, coat, col)


def skin_chef(o, col):
    jacket = material('outfit-main-chef', '#f4f4f4', 0.4)
    dark = material('outfit-dark', '#2a2a2a', 0.5)
    red = material('outfit-red', '#c91a09', 0.35)
    o.add('Body', shell('Jacket', 0.5, 0.86, 0.012, jacket, col))
    o.add('Body', box('Collar', (0.2, 0.2, 0.04), (0, 0, 0.84), jacket, col, bevel=0.012))
    for row, z in enumerate((0.56, 0.64, 0.72)):
        for sx in (1, -1):
            o.add('Body', cylinder(f'Button{row}{sx}', 0.014, 0.01, (sx * 0.07, front(0) - 0.012, z), dark, col, rotation=(math.pi / 2, 0, 0)))
    # Halstuch
    o.add('Body', box('Scarf', (0.12, 0.03, 0.07), (0, front(0) - 0.005, 0.79), red, col, bevel=0.012, rotation=(0, math.radians(45), 0)))
    o.add('Hips', box('Apron', (2 * PITCH + 0.012, 0.27, 0.08), (0, HIP_Y, HIP_Z), jacket, col, bevel=0.015))
    sleeves(o, jacket, col)


def skin_police(o, col):
    vest = material('outfit-main-police', '#1f2a44', 0.45)
    gold = material('outfit-gold', '#f2cd37', 0.2, 0.7)
    dark = material('outfit-dark', '#2a2a2a', 0.5)
    o.add('Body', shell('Vest', 0.52, 0.85, 0.012, vest, col))
    o.add('Body', star('Badge', 0.04, 0.018, 0.012, (0.1, front(0) - 0.01, 0.74), gold, col, rotation=(math.pi / 2, 0, 0)))
    o.add('Body', box('Radio', (0.05, 0.03, 0.08), (-0.11, front(0) - 0.026, 0.71), dark, col, bevel=0.008))
    o.add('Body', cylinder('Antenna', 0.006, 0.07, (-0.125, front(0) - 0.026, 0.79), dark, col))
    for sx in (1, -1):
        o.add('Body', box(f'Epaulette{sx}', (0.07, 0.16, 0.02), (sx * 0.15, 0, 0.85), vest, col, bevel=0.006))
    belt(o, dark, gold, col, pouch=dark)


def skin_firefighter(o, col):
    jacket = material('outfit-main-firefighter', '#26324a', 0.5)
    yellow = material('outfit-hivis-yellow', '#e3de1e', 0.35)
    reflect = material('outfit-reflect', '#e3e7ea', 0.15, 0.6)
    dark = material('outfit-dark', '#2a2a2a', 0.5)
    o.add('Body', shell('Jacket', 0.5, 0.86, 0.012, jacket, col))
    for z in (0.56, 0.7):
        o.add('Body', shell(f'Band{z}', z, z + 0.05, 0.02, yellow, col))
        o.add('Body', shell(f'Silver{z}', z + 0.015, z + 0.035, 0.024, reflect, col))
    o.add('Body', box('Zip', (0.014, 0.01, 0.34), (0, front(0) - 0.017, 0.51), dark, col, bevel=0.003))
    sleeves(o, jacket, col, cuff=yellow)
    for side, sx in (('L', 1), ('R', -1)):
        o.add(f'Leg{side}', box(f'LegBand{side}', (PITCH - 0.005, SHIN_D + 0.015, 0.045), (sx * LEG_X, HIP_Y + 0.02, 0.2), yellow, col, bevel=0.01))
    belt(o, dark, reflect, col)


def skin_astronaut(o, col):
    suit = material('outfit-main-astronaut', '#f4f4f4', 0.45)
    grey = material('outfit-grey', '#a0a5a9', 0.4)
    btn = [material('outfit-btn-red', '#c91a09', 0.2), material('outfit-btn-blue', '#0055bf', 0.2), material('outfit-btn-yellow', '#f2cd37', 0.2)]
    o.add('Body', shell('Suit', 0.5, 0.86, 0.012, suit, col))
    o.add('Body', box('Panel', (0.17, 0.03, 0.1), (0, front(0) - 0.02, 0.6), grey, col, bevel=0.01))
    for i, m in enumerate(btn):
        o.add('Body', cylinder(f'Btn{i}', 0.014, 0.012, ((i - 1) * 0.05, front(0) - 0.034, 0.65), m, col, rotation=(math.pi / 2, 0, 0)))
    o.add('Body', box('Pack', (0.34, 0.12, 0.32), (0, TORSO_D / 2 + 0.06, 0.52), suit, col, bevel=0.03))
    for sx in (1, -1):
        o.add('Body', cylinder(f'Tank{sx}', 0.04, 0.26, (sx * 0.09, TORSO_D / 2 + 0.135, 0.55), grey, col, bevel=0.01))
    sleeves(o, suit, col, cuff=grey)
    for side, sx in (('L', 1), ('R', -1)):
        o.add(f'Leg{side}', box(f'Boot{side}', (PITCH - 0.004, FOOT_Y1 - FOOT_Y0 + 0.008, 0.06), (sx * LEG_X, (FOOT_Y0 + FOOT_Y1) / 2, FOOT_H - 0.005), grey, col, bevel=0.012))
    belt(o, grey, suit, col)


def skin_knight(o, col):
    armor = material('outfit-main-knight', '#aeb4ba', 0.25, 0.75)
    red = material('outfit-red', '#c91a09', 0.35)
    leather = material('outfit-leather', '#6b4423', 0.6)
    gold = material('outfit-gold', '#f2cd37', 0.2, 0.7)
    o.add('Body', shell('Breastplate', 0.52, 0.86, 0.014, armor, col))
    # Wappen: Kreuz auf dem Brustpanzer
    o.add('Body', box('CrossV', (0.04, 0.012, 0.2), (0, front(0) - 0.018, 0.56), red, col, bevel=0.004))
    o.add('Body', box('CrossH', (0.14, 0.012, 0.04), (0, front(0) - 0.018, 0.69), red, col, bevel=0.004))
    for side, sx in (('L', 1), ('R', -1)):
        o.add(f'Arm{side}', sphere(f'Pauldron{side}', 0.085, tuple(arm_point(side, (sx * ARM_OUT, 0, -0.01))), armor, col, scale=(1, 1.1, 0.75), half=True))
        o.add(f'Leg{side}', box(f'Greave{side}', (PITCH - 0.004, 0.08, 0.2), (sx * LEG_X, HIP_Y - 0.09, FOOT_H + 0.02), armor, col, bevel=0.012))
    belt(o, leather, gold, col)
    # Schwert am Gürtel
    o.add('Hips', box('Scabbard', (0.03, 0.05, 0.26), (-0.27, HIP_Y, HIP_Z - 0.24), leather, col, bevel=0.008))
    o.add('Hips', box('Hilt', (0.1, 0.03, 0.025), (-0.27, HIP_Y, HIP_Z + 0.02), gold, col, bevel=0.005))


def skin_pirate(o, col):
    vest = material('outfit-main-pirate', '#5a1f1f', 0.5)
    red = material('outfit-red', '#c91a09', 0.35)
    leather = material('outfit-leather', '#6b4423', 0.6)
    gold = material('outfit-gold', '#f2cd37', 0.2, 0.7)
    dark = material('outfit-dark', '#2a2a2a', 0.5)
    shell_obj = shell('Vest', 0.5, 0.86, 0.012, vest, col)
    cut(shell_obj, box('Opening', (0.13, 0.12, 0.5), (0, -0.14, 0.45), vest, col, bevel=0))
    o.add('Body', shell_obj)
    # Schultergurt quer über die Brust
    o.add('Body', box('Bandolier', (0.05, 0.02, 0.48), (0, front(0) - 0.02, 0.68), leather, col, bevel=0.006, rotation=(0, math.radians(38), 0), center=True))
    o.add('Body', box('BandolierBuckle', (0.04, 0.02, 0.04), (0.03, front(0) - 0.03, 0.7), gold, col, bevel=0.004, rotation=(0, math.radians(38), 0), center=True))
    o.add('Hips', box('Sash', (2 * PITCH + 0.012, 0.27, 0.07), (0, HIP_Y, HIP_Z + 0.01), red, col, bevel=0.015))
    o.add('Hips', box('SashEnd', (0.06, 0.02, 0.14), (0.16, HIP_Y - 0.14, HIP_Z - 0.1), red, col, bevel=0.008))
    # Augenklappe (am Kopf, rechtes Auge)
    theta = math.asin(-0.055 / HEAD_R)
    r = HEAD_R + 0.002
    o.add('Head', cylinder('Patch', 0.032, 0.008, (r * math.sin(theta), -r * math.cos(theta), EYE_Z), dark, col, rotation=(math.pi / 2, 0, theta), scale=(1, 1.15, 1)))
    o.add('Head', torus('PatchStrap', HEAD_R + 0.004, 0.005, (0, 0, EYE_Z + 0.03), dark, col, rotation=(0, math.radians(-14), 0)))


def skin_farmer(o, col):
    denim = material('outfit-main-farmer', '#3d5f8f', 0.55)
    gold = material('outfit-gold', '#f2cd37', 0.2, 0.7)
    # Latzhose: Latz vorne, Träger über die Schultern
    o.add('Body', box('Bib', (0.3, 0.02, 0.24), (0, front(0) - 0.005, 0.5), denim, col, bevel=0.012))
    o.add('Body', shell('Waist', 0.5, 0.56, 0.012, denim, col))
    for sx in (1, -1):
        o.add('Body', box(f'StrapF{sx}', (0.04, 0.016, 0.13), (sx * 0.11, front(0) - 0.004, 0.73), denim, col, bevel=0.005))
        o.add('Body', box(f'StrapTop{sx}', (0.04, TORSO_D + 0.02, 0.016), (sx * 0.11, 0, 0.855), denim, col, bevel=0.005))
        o.add('Body', box(f'StrapB{sx}', (0.04, 0.016, 0.3), (sx * 0.11, TORSO_D / 2 + 0.004, 0.56), denim, col, bevel=0.005))
        o.add('Body', cylinder(f'BibButton{sx}', 0.016, 0.012, (sx * 0.11, front(0) - 0.016, 0.72), gold, col, rotation=(math.pi / 2, 0, 0)))
    o.add('Body', box('BibPocket', (0.12, 0.012, 0.08), (0, front(0) - 0.018, 0.6), denim, col, bevel=0.006))
    o.add('Hips', box('Waistband', (2 * PITCH + 0.012, 0.27, 0.08), (0, HIP_Y, HIP_Z), denim, col, bevel=0.015))
    for side, sx in (('L', 1), ('R', -1)):
        o.add(f'Leg{side}', box(f'Patch{side}', (0.08, 0.012, 0.08), (sx * LEG_X, HIP_Y - 0.096, 0.24), material('outfit-patch', '#8a6a3a', 0.6), col, bevel=0.006))


SKINS = {
    'worker': skin_worker,
    'doctor': skin_doctor,
    'chef': skin_chef,
    'police': skin_police,
    'firefighter': skin_firefighter,
    'astronaut': skin_astronaut,
    'knight': skin_knight,
    'pirate': skin_pirate,
    'farmer': skin_farmer,
}


# ---------------------------------------------------------------------------
# Zubehör (am Kopf). Kopfbedeckungen ersetzen in three.js die Frisur oben (HairTop), siehe ACCESSORY_HIDES.
# Standardfarben müssen zu ACCESSORY_COLORS in packages/world/src/types.ts passen.

HAT_Z = 1.05     # Unterkante von Hüten auf dem Kopf


def acc_cap(o, col, main):
    o.add('Head', cylinder('Crown', HEAD_R + 0.02, 0.13, (0, 0, HAT_Z), main, col, bevel=0.06, vertices=48))
    brim = cylinder('Brim', 0.16, 0.02, (0, -0.11, HAT_Z + 0.01), main, col, scale=(1, 0.9, 1), bevel=0.008)
    cut(brim, box('BrimCut', (0.5, 0.4, 0.1), (0, 0.15, HAT_Z - 0.02), main, col, bevel=0))
    o.add('Head', brim)
    o.add('Head', cylinder('Button', 0.025, 0.02, (0, 0, HAT_Z + 0.125), main, col, bevel=0.006))


def acc_hat(o, col, main):
    band = material('acc-band-hat', '#c91a09', 0.35)
    o.add('Head', cylinder('Brim', 0.25, 0.025, (0, 0, HAT_Z + 0.02), main, col, bevel=0.01, vertices=48))
    o.add('Head', cylinder('Top', 0.16, 0.24, (0, 0, HAT_Z + 0.04), main, col, bevel=0.02, vertices=48, radius2=0.17))
    o.add('Head', cylinder('Band', 0.163, 0.04, (0, 0, HAT_Z + 0.045), band, col, vertices=48, radius2=0.165))


def acc_helmet(o, col, main):
    # Bauhelm: Kuppel, Krempe mit Schirm vorne, Mittelgrat
    o.add('Head', sphere('Dome', 0.18, (0, 0, HAT_Z + 0.02), main, col, scale=(1, 1.05, 0.85), half=True))
    o.add('Head', cylinder('Rim', 0.2, 0.018, (0, 0.005, HAT_Z + 0.015), main, col, scale=(1, 1.08, 1), bevel=0.006, vertices=48))
    o.add('Head', cylinder('Peak', 0.14, 0.018, (0, -0.12, HAT_Z + 0.03), main, col, scale=(1.2, 0.8, 1), bevel=0.006))
    o.add('Head', box('Ridge', (0.05, 0.36, 0.035), (0, 0, HAT_Z + 0.15), main, col, bevel=0.015, rotation=(0, 0, 0)))


def acc_crown(o, col, main):
    gem = material('acc-gem', '#c91a09', 0.1, 0.2)
    ring = cylinder('Ring', 0.172, 0.07, (0, 0, 1.15), main, col, vertices=48)
    cut(ring, cylinder('RingHole', 0.156, 0.1, (0, 0, 1.13), main, col, vertices=48))
    o.add('Head', ring)
    for i in range(6):
        a = i / 6 * math.pi * 2 + math.pi / 2
        o.add('Head', cylinder(f'Spike{i}', 0.035, 0.08, (math.cos(a) * 0.164, math.sin(a) * 0.164, 1.215), main, col, radius2=0.004, vertices=12))
        o.add('Head', sphere(f'Gem{i}', 0.016, (math.cos(a + math.pi / 6) * 0.174, math.sin(a + math.pi / 6) * 0.174, 1.185), gem, col, segments=12))


def acc_beanie(o, col, main):
    white = material('acc-detail-beanie', '#f4f4f4', 0.7)
    o.add('Head', sphere('Dome', HEAD_R + 0.02, (0, 0, HAT_Z + 0.04), main, col, scale=(1, 1, 1.05), half=True))
    o.add('Head', cylinder('Cuff', HEAD_R + 0.028, 0.06, (0, 0, HAT_Z), main, col, bevel=0.015, vertices=48))
    o.add('Head', sphere('Pompom', 0.055, (0, 0, HAT_Z + 0.25), white, col, segments=16))


def acc_headphones(o, col, main):
    cushion = material('acc-detail-headphones', '#2a2a2a', 0.6)
    o.add('Head', torus('Band', 0.21, 0.016, (0, 0, 1.04), main, col, rotation=(math.pi / 2, 0, 0), keep=lambda x, y: y > -0.02))
    for sx in (1, -1):
        o.add('Head', cylinder(f'Cup{sx}', 0.06, 0.05, (sx * 0.165, 0, EYE_Z - 0.02), main, col, rotation=(0, sx * math.pi / 2, 0), bevel=0.012))
        o.add('Head', cylinder(f'Cushion{sx}', 0.05, 0.02, (sx * 0.15, 0, EYE_Z - 0.02), cushion, col, rotation=(0, sx * math.pi / 2, 0), bevel=0.006))


def acc_glasses(o, col, main):
    lens = material('acc-glass-glasses', '#bfe3ff', 0.05, 0.0, alpha=0.35)
    y = -HEAD_R - 0.018
    for sx in (1, -1):
        o.add('Head', torus(f'Rim{sx}', 0.034, 0.007, (sx * 0.058, y, EYE_Z), main, col, rotation=(math.pi / 2, 0, 0)))
        o.add('Head', cylinder(f'Lens{sx}', 0.032, 0.004, (sx * 0.058, y + 0.002, EYE_Z), lens, col, rotation=(math.pi / 2, 0, 0)))
        o.add('Head', box(f'Temple{sx}', (0.008, 0.16, 0.01), (sx * 0.152, y + 0.08, EYE_Z - 0.005), main, col, bevel=0.002))
    o.add('Head', box('Bridge', (0.04, 0.008, 0.01), (0, y, EYE_Z + 0.005), main, col, bevel=0.002))


def acc_chef_hat(o, col, main):
    o.add('Head', cylinder('Band', HEAD_R + 0.02, 0.09, (0, 0, HAT_Z), main, col, bevel=0.01, vertices=48))
    o.add('Head', cylinder('Stem', 0.16, 0.12, (0, 0, HAT_Z + 0.08), main, col, radius2=0.2, vertices=48))
    o.add('Head', sphere('Puff', 0.21, (0, 0, HAT_Z + 0.2), main, col, scale=(1, 1, 0.6)))


def acc_cowboy_hat(o, col, main):
    band = material('acc-band-cowboy', '#6b4423', 0.6)
    brim = cylinder('Brim', 0.29, 0.02, (0, 0, HAT_Z + 0.03), main, col, scale=(1, 0.85, 1), bevel=0.008, vertices=48)
    bm = bmesh.new()
    bm.from_mesh(brim.data)
    for v in bm.verts:
        v.co.z += 2.5 * max(0.0, abs(v.co.x) - 0.12) ** 2
    bm.to_mesh(brim.data)
    bm.free()
    o.add('Head', brim)
    top = cylinder('Top', 0.165, 0.17, (0, 0, HAT_Z + 0.04), main, col, radius2=0.14, bevel=0.03, vertices=48, scale=(1, 1.1, 1))
    cut(top, sphere('Dent', 0.08, (0, 0, HAT_Z + 0.25), main, col, scale=(0.6, 1.4, 1)))
    o.add('Head', top)
    o.add('Head', cylinder('Band', 0.162, 0.035, (0, 0, HAT_Z + 0.045), band, col, vertices=48, scale=(1, 1.1, 1)))


def acc_wizard_hat(o, col, main):
    stars = material('acc-detail-wizard', '#f2cd37', 0.25, 0.4)
    o.add('Head', cylinder('Brim', 0.25, 0.02, (0, 0, HAT_Z + 0.02), main, col, bevel=0.008, vertices=48))
    o.add('Head', cylinder('Cone', 0.165, 0.38, (0, 0, HAT_Z + 0.03), main, col, radius2=0.012, vertices=48))
    for i, (a, z) in enumerate(((0.2, 1.17), (-0.6, 1.26), (0.5, 1.33))):
        r = 0.165 - (z - HAT_Z - 0.03) / 0.38 * 0.153 + 0.002
        o.add('Head', star(f'Star{i}', 0.03, 0.013, 0.008, (math.sin(a) * r, -math.cos(a) * r, z), stars, col, rotation=(math.pi / 2 - 0.4, 0, a)))


def acc_pirate_hat(o, col, main):
    white = material('acc-detail-pirate', '#f4f4f4', 0.4)
    o.add('Head', sphere('Dome', HEAD_R + 0.02, (0, 0, HAT_Z + 0.02), main, col, scale=(1, 1, 0.9), half=True))
    bicorne = cylinder('Bicorne', 0.27, 0.06, (0, 0.03, HAT_Z - 0.02), main, col, rotation=(math.pi / 2, 0, 0), scale=(1, 0.75, 1), bevel=0.012, vertices=48)
    cut(bicorne, box('Lower', (0.8, 0.4, 0.4), (0, 0, HAT_Z - 0.38), main, col, bevel=0))
    o.add('Head', bicorne)
    # Totenkopf vorne
    o.add('Head', cylinder('Skull', 0.035, 0.01, (0, -0.034, HAT_Z + 0.1), white, col, rotation=(math.pi / 2, 0, 0)))
    for sx in (1, -1):
        o.add('Head', box(f'Bone{sx}', (0.1, 0.008, 0.016), (0, -0.032, HAT_Z + 0.06), white, col, bevel=0.004, rotation=(0, sx * 0.6, 0), center=True))


def acc_space_helmet(o, col, main):
    glass = material('acc-glass-space', '#cfe8ff', 0.05, 0.0, alpha=0.25)
    o.add('Head', sphere('Bubble', 0.25, (0, 0, 1.04), glass, col, segments=40))
    o.add('Head', cylinder('Collar', 0.2, 0.06, (0, 0, NECK_Z - 0.04), main, col, bevel=0.02, vertices=48))
    o.add('Head', box('Antenna', (0.012, 0.012, 0.08), (0.16, 0.06, 1.2), main, col, bevel=0.003))


def acc_knight_helmet(o, col, main):
    plume = material('acc-detail-knight', '#c91a09', 0.6)
    shell_obj = cylinder('Helm', HEAD_R + 0.03, 0.34, (0, 0, HEAD_Z0 - 0.02), main, col, bevel=0.07, vertices=48)
    shell_obj.modifiers.clear()
    cut(shell_obj, cylinder('Inside', HEAD_R + 0.008, 0.33, (0, 0, HEAD_Z0 - 0.03), main, col, vertices=48))
    cut(shell_obj, box('Visor', (0.2, 0.2, 0.03), (0, -0.15, EYE_Z - 0.015), main, col, bevel=0))
    cut(shell_obj, box('Breath', (0.025, 0.2, 0.06), (0, -0.15, EYE_Z - 0.11), main, col, bevel=0))
    smooth(shell_obj, sharp=False)
    o.add('Head', shell_obj)
    o.add('Head', box('Plume', (0.04, 0.26, 0.09), (0, 0.04, HEAD_Z0 + 0.31), plume, col, bevel=0.02))


def acc_bow(o, col, main):
    knot = (0.11, -0.02, 1.17)
    for sx in (1, -1):
        o.add('Head', sphere(f'Loop{sx}', 0.055, (knot[0] + sx * 0.045 * 0.7, knot[1], knot[2] + sx * 0.045 * 0.7), main, col, scale=(0.9, 0.35, 0.6), segments=20))
    o.add('Head', sphere('Knot', 0.025, knot, main, col, segments=16))


ACCESSORIES = {
    'cap': (acc_cap, '#0055bf'),
    'hat': (acc_hat, '#1b1b1b'),
    'helmet': (acc_helmet, '#f2cd37'),
    'crown': (acc_crown, '#f2cd37'),
    'beanie': (acc_beanie, '#c91a09'),
    'headphones': (acc_headphones, '#3a3a3a'),
    'glasses': (acc_glasses, '#1b1b1b'),
    'chefHat': (acc_chef_hat, '#f4f4f4'),
    'cowboyHat': (acc_cowboy_hat, '#a5713f'),
    'wizardHat': (acc_wizard_hat, '#3c2a7a'),
    'pirateHat': (acc_pirate_hat, '#1b1b1b'),
    'spaceHelmet': (acc_space_helmet, '#f4f4f4'),
    'knightHelmet': (acc_knight_helmet, '#aeb4ba'),
    'bow': (acc_bow, '#e4789c'),
}
METALLIC = {'crown', 'knightHelmet'}


def build_outfits():
    col = collection('outfits')
    groups = {}
    for name, build in SKINS.items():
        sub = collection(f'skin-{name}', col)
        o = Outfit(f'skin__{name}__', sub)
        build(o, sub)
        o.finish()
        groups[f'skin-{name}'] = sub
    for name, (build, color) in ACCESSORIES.items():
        sub = collection(f'acc-{name}', col)
        main = material(f'acc-main-{name}', color, 0.22 if name in METALLIC else 0.3, 0.6 if name in METALLIC else 0.0)
        o = Outfit(f'acc__{name}__', sub)
        build(o, sub, main)
        o.finish()
        groups[f'acc-{name}'] = sub
    return col, groups


# ---------------------------------------------------------------------------
# Export

def export(cols, filename, animations=False):
    bpy.ops.object.select_all(action='DESELECT')
    for col in cols:
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
        export_animations=animations,
        export_animation_mode='NLA_TRACKS',
        export_force_sampling=True,
        export_optimize_animation_size=True,
    )


def rename_exported(col, prefix):
    """Nach dem Export eindeutig umbenennen, damit die nächste Figur wieder ArmL, Head … heißen kann"""
    for obj in col.all_objects:
        obj.name = f'{prefix}:{obj.name}'


def preview(characters, outfit_groups, world_cols):
    """Eigene Szene mit Collection-Instanzen: Bauteile und Figuren, darunter alle Skins und das Zubehör"""
    scene = bpy.data.scenes.new('Preview')
    bpy.context.window.scene = scene if bpy.context.window else scene

    def instance(col, location):
        obj = bpy.data.objects.new(f'inst-{col.name}', None)
        obj.instance_type = 'COLLECTION'
        obj.instance_collection = col
        obj.location = location
        scene.collection.objects.link(obj)
        return obj

    row0 = [*world_cols, *characters]
    for i, col in enumerate(row0):
        instance(col, (i * 1.1, 0, 0))
    skins = [g for k, g in outfit_groups.items() if k.startswith('skin-')]
    default_acc = {'worker': 'helmet', 'doctor': 'glasses', 'chef': 'chefHat', 'police': 'cap', 'firefighter': 'helmet',
                   'astronaut': 'spaceHelmet', 'knight': 'knightHelmet', 'pirate': 'pirateHat', 'farmer': 'cowboyHat'}
    for i, col in enumerate(skins):
        x = i * 0.75
        instance(characters[i % len(characters)], (x, 0, 1.5))
        instance(col, (x, 0, 1.5))
        acc = outfit_groups.get(f"acc-{default_acc[col.name.removeprefix('skin-')]}")
        if acc:
            instance(acc, (x, 0, 1.5))
    accs = [g for k, g in outfit_groups.items() if k.startswith('acc-')]
    for i, col in enumerate(accs):
        x = i * 0.52
        instance(characters[i % len(characters)], (x, 0, 3.0))
        instance(col, (x, 0, 3.0))

    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.5
    sun.rotation_euler = (0.7, 0.2, 0.6)
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new('PreviewWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.9, 0.92, 0.95, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    scene.world = world
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 8.2
    cam.location = (3.35, -10, 3.3)
    cam.rotation_euler = (math.radians(84), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.frame_current = 0
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.film_transparent = False
    scene.render.filepath = os.path.join(ROOT, 'assets', 'blender', 'preview.png')
    bpy.ops.render.render(write_still=True, scene=scene.name)


def main():
    reset_scene()
    os.makedirs(OUT, exist_ok=True)
    white = material('brick-white', '#ffffff', 0.3)

    world_parts = {
        'brick.glb': build_brick(white),
        'plate.glb': build_plate(white),
        'tile.glb': build_tile(white),
    }
    for filename, col in world_parts.items():
        export([col], filename)

    characters = []
    for name, shirt, pants, hair, style in (
        ('male', '#0055bf', '#3a3a3a', '#5b3a1e', 'short'),
        ('female', '#c91a09', '#1f3b70', '#b98a3e', 'long'),
        ('diverse', '#237841', '#c9b48a', '#6b2f86', 'bun'),
    ):
        col, _ = build_character(name, shirt, pants, hair, style)
        export([col], f'character-{name}.glb', animations=True)
        rename_exported(col, name)
        characters.append(col)

    outfits, groups = build_outfits()
    export([outfits], 'outfits.glb')

    preview(characters, groups, list(world_parts.values()))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'assets', 'blender', 'klonk-models.blend'))
    print('[klonk] Modelle exportiert nach', OUT)


main()
