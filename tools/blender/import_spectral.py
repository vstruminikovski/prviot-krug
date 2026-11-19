"""
Optimise the CC0 "Spectral GT-RS" car (github.com/JaronKBragg7337/spectral-gt-rs) for the game.
Maps it onto the game's GLB conventions (see generate_vehicles.py): Wheel_FL/FR/RL/RR pivots,
materials Paint/Glass/TailLamp/IndL/IndR/HeadLamp, PlateMount_F/R empties, +X forward, origin on ground.

  Blender -b --factory-startup --python tools/blender/import_spectral.py -- <in.glb> public/assets/vehicles/spectral.glb [target_tris]
"""
import bpy, sys, math
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = a[0], a[1]
TARGET = int(a[2]) if len(a) > 2 else 28000

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]

# apply all transforms into mesh data, then unparent (flatten the hierarchy)
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
    o.animation_data_clear()
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in bpy.data.objects if o.type != "MESH"]:
    bpy.data.objects.remove(o, do_unlink=True)

def bounds(objs):
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    return mn, mx

# forward = side with the headlamps
mn, mx = bounds(meshes)
head = [o for o in meshes if any(m and "Headlamp" in m.name for m in o.data.materials)]
hx = sum((o.matrix_world @ o.data.vertices[0].co).x for o in head) / max(1, len(head))
if hx < (mn.x + mx.x) / 2:
    for o in meshes:
        o.data.transform(__import__("mathutils").Matrix.Rotation(math.pi, 4, "Z"))
mn, mx = bounds(meshes)
shift = Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))
for o in meshes:
    o.data.transform(__import__("mathutils").Matrix.Translation(shift))

# materials → game conventions
REN = {"Spectral Blue — Clearcoat": "Paint", "Smoked Smart Glass": "Glass", "Tail Lamp Red": "TailLamp", "Headlamp White": "HeadLamp"}
for m in bpy.data.materials:
    if m.name in REN:
        m.name = REN[m.name]
amber = bpy.data.materials.get("Indicator Amber")
if amber:
    indL = amber.copy(); indL.name = "IndL"; amber.name = "IndR"
    for o in meshes:
        if amber.name in [m.name for m in o.data.materials if m]:
            cy = sum((o.matrix_world @ v.co).y for v in o.data.vertices) / max(1, len(o.data.vertices))
            if cy > 0:  # +Y = vehicle left
                o.data.materials[[m.name for m in o.data.materials].index("IndR")] = indL

# drop parts never visible in play, then decimate only round/inner parts; body panels stay intact
HIDDEN = ("Plate", "Badge", "Engine", "Turbo", "Intake", "Coil", "Damper", "Control_Arm", "Brake_Line", "Suspension", "Exhaust_Inner", "Undertray", "Center_Tunnel", "Cockpit_Floor")
for o in list(meshes):
    if any(h in o.name for h in HIDDEN):
        meshes.remove(o); bpy.data.objects.remove(o, do_unlink=True)
DECIMATE = ("Fender_Lip", "Mirror_Shell", "Tire", "Sidewall", "Rim", "Spoke", "Disc", "Seat", "Headrest", "Steering", "Dash", "Vent", "Belt", "Hub")
for o in meshes:
    if len(o.data.polygons) < 48 or not any(k in o.name for k in DECIMATE):
        continue
    d = o.modifiers.new("dec", "DECIMATE"); d.ratio = 0.18
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=d.name)
# planar dissolve elsewhere: merges coplanar faces only, so panels keep their shape
for o in meshes:
    if len(o.data.polygons) < 48 or any(k in o.name for k in DECIMATE):
        continue
    d = o.modifiers.new("plan", "DECIMATE"); d.decimate_type = "DISSOLVE"; d.angle_limit = math.radians(4)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=d.name)

# wheel pivots: everything named Front_Left_* etc. goes under Wheel_FL at its centre
mn, mx = bounds(meshes)
for key, code in (("Front_Left", "FL"), ("Front_Right", "FR"), ("Rear_Left", "RL"), ("Rear_Right", "RR")):
    parts = [o for o in meshes if o.name.startswith(key) and not any(s in o.name for s in ("Control_Arm", "Damper", "Coil", "Brake_Line", "Caliper"))]
    if not parts:
        continue
    pm, px = bounds(parts)
    c = (pm + px) / 2
    piv = bpy.data.objects.new("Wheel_" + code, None); bpy.context.collection.objects.link(piv)
    piv.location = c
    for o in parts:
        o.data.transform(__import__("mathutils").Matrix.Translation(-c))
        o.parent = piv
hl = (mx.x - mn.x) / 2
for name, x, z in (("PlateMount_F", hl + 0.02, 0.35), ("PlateMount_R", -hl - 0.02, 0.45)):
    e = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(e); e.location = (x, 0, z)

tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True, export_cameras=False,
                          export_lights=False, export_animations=False, export_draco_mesh_compression_enable=False)
print(f"[krug] spectral → {OUT}: {tris} tris, dims {tuple(round(v, 2) for v in (mx - mn))}")
