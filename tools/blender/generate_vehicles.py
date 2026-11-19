"""
Original low-poly vehicle generator for „Круг низ маалото“.

Builds every vehicle in vehicles.json (exported from src/game/vehicles/defs.ts, so the meshes
always match the physics dimensions) as modular, named parts and exports one GLB per vehicle.

Run (Blender 4.2+ / 5.x, background mode):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python tools/blender/generate_vehicles.py -- tools/blender/vehicles.json public/assets/vehicles [vehicle_id] [--preview]

Conventions (documented in tools/blender/README.md):
  * Blender +X = vehicle forward, +Z = up, +Y = vehicle LEFT  (glTF/three: +x fwd, +y up, +z right)
  * origin = centre of the footprint on the ground; units = metres
  * node names: Body, Greenhouse, Glass_*, Wheel_FL/FR/RL/RR (pivot at the hub), SteeringWheel,
    GearLever (pivot at the gate), PlateMount_F / PlateMount_R (empties), Lamp_Head, Lamp_Tail,
    Ind_L, Ind_R, Bumper_*, Mirror_L/R, Interior_*
  * material names: Paint (recoloured live in the game), Glass, Trim, Chrome, Tire, Hub,
    HeadLamp, TailLamp, IndL, IndR, Interior, Seat, Dash
"""
import bpy, bmesh, json, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SPEC, OUT = argv[0], argv[1]
ONLY = next((a for a in argv[2:] if not a.startswith("--")), None)
PREVIEW = "--preview" in argv


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexcol(h):
    h = h.lstrip("#")
    return tuple(srgb_to_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def mat(name, rgb, metal=0.0, rough=0.55, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*rgb, 1)  # viewport/workbench colour for previews
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 0.6
    return m


def link(ob, parent=None):
    bpy.context.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def mesh_obj(name, bm, material, flat=True, parent=None):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = not flat
    me.materials.append(material)
    return link(bpy.data.objects.new(name, me), parent)


def loft(rings, cap=True):
    bm = bmesh.new()
    vr = [[bm.verts.new(Vector(v)) for v in r] for r in rings]
    n = len(rings[0])
    for a, b in zip(vr, vr[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap:
        bm.faces.new(list(reversed(vr[0])))
        bm.faces.new(vr[-1])
    return bm


def box(name, size, loc, material, parent=None, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    ob = mesh_obj(name, bm, material, parent=parent)
    ob.location = loc
    if rot:
        ob.rotation_euler = rot
    return ob


def cylinder(name, r, depth, loc, material, axis="Y", segs=16, parent=None, flat=False):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=depth)
    ob = mesh_obj(name, bm, material, flat=flat, parent=parent)
    ob.location = loc
    if axis == "Y":
        ob.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == "X":
        ob.rotation_euler = (0, math.pi / 2, 0)
    return ob


def apply_boolean(target, cutter):
    mod = target.modifiers.new("arch", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    try:
        mod.solver = "EXACT"
    except TypeError:
        pass
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    target.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)


def bevel(ob, width=0.018):
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = 1
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(35)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    ob.select_set(False)


# ------------------------------------------------------------------ vehicle
def lower_section(x, zb, zt, hw):
    c = min(0.07, (zt - zb) * 0.25)
    sh = min(0.14, (zt - zb) * 0.35)
    half = [(x, hw - c, zb), (x, hw, zb + c), (x, hw, zt - sh), (x, hw - 0.05, zt - 0.03), (x, hw - 0.16, zt)]
    other = [(x, -y, z) for (_, y, z) in reversed(half)]
    return half + other


def build_vehicle(v):
    d = v["dims"]
    p = v["profile"]
    L, W, H = d["L"], d["W"], d["H"]
    hl, hw = L / 2, W / 2
    r = d["wheelR"]
    kind = p["kind"]
    zb = p.get("bottom", d["groundClearance"] + 0.08)
    fx = hl - d["frontOverhang"]
    rx = fx - d["wheelbase"]
    tw = d["track"] / 2

    M = {
        "Paint": mat("Paint", hexcol(v["paint"]), 0.15, 0.42),
        "Glass": mat("Glass", (0.03, 0.05, 0.06), 0.3, 0.08),
        "Trim": mat("Trim", (0.02, 0.02, 0.02), 0.0, 0.7),
        "Chrome": mat("Chrome", (0.75, 0.75, 0.72), 0.9, 0.22),
        "Tire": mat("Tire", (0.012, 0.012, 0.012), 0.0, 0.85),
        "Hub": mat("Hub", (0.45, 0.45, 0.43), 0.7, 0.35),
        "HeadLamp": mat("HeadLamp", (0.85, 0.82, 0.7), 0.2, 0.15, emit=(0.05, 0.045, 0.03)),
        "TailLamp": mat("TailLamp", (0.25, 0.01, 0.01), 0.1, 0.3, emit=(0.02, 0, 0)),
        "IndL": mat("IndL", (0.6, 0.25, 0.02), 0.1, 0.3),
        "IndR": mat("IndR", (0.6, 0.25, 0.02), 0.1, 0.3),
        "Interior": mat("Interior", (0.03, 0.035, 0.035), 0.0, 0.8),
        "Seat": mat("Seat", hexcol("#c9b48a"), 0.0, 0.9),
        "Dash": mat("Dash", hexcol("#1f3b3a"), 0.0, 0.7),
    }
    root = link(bpy.data.objects.new(v["id"], None))

    if kind == "truck":
        return build_truck(v, root, M)

    # ---- lower body: rear deck → cabin belt → bonnet
    def top_at(x):
        if x <= p["back"]:
            return p["tail"]
        if x <= p["ws"]:
            return p["belt"]
        u = (x - p["ws"]) / max(0.01, (hl - 0.1) - p["ws"])
        return p["belt"] + (p["hood"] - p["belt"]) * min(1, u)

    xs = sorted(set([-hl, -hl + 0.1, p["back"] - 0.02, p["back"] + 0.05, rx - r - 0.15, rx + r + 0.15,
                     (p["ws"] + p["back"]) / 2, p["ws"], fx - r - 0.1, fx + r + 0.1, hl - 0.12, hl]))
    xs = [x for x in xs if -hl <= x <= hl]
    rings = []
    for x in xs:
        end = 1.0 if -hl + 0.1 <= x <= hl - 0.12 else 0.95
        zt = top_at(x)
        zbb = zb + (0.06 if x in (-hl, hl) else 0)
        if x == hl:
            zt -= 0.1
        if x == -hl and kind != "van":
            zt -= 0.08
        rings.append(lower_section(x, zbb, zt, hw * end))
    body = mesh_obj("Body", loft(rings), M["Paint"], parent=root)
    # wheel arches
    for wx in (fx, rx):
        cut = cylinder("cut", r + 0.07, W + 0.6, (wx, 0, r), M["Trim"], segs=18)
        apply_boolean(body, cut)
    bevel(body, 0.012)

    # ---- greenhouse (painted) + glass panes laid on its surface
    def roof_at(x):
        if kind == "van":
            if x >= p["roofF"]:
                return p["belt"] + (H - p["belt"]) * min(1, (p["ws"] - x) / max(0.01, p["ws"] - p["roofF"]))
            return H
        if x >= p["roofF"]:
            return p["belt"] + (H - p["belt"]) * min(1, (p["ws"] - x) / max(0.01, p["ws"] - p["roofF"]))
        if x >= p["roofR"]:
            return H
        lo = p["tail"] if kind in ("saloon", "fastback") else p["belt"]
        return lo + (H - lo) * max(0, (x - p["back"]) / max(0.01, p["roofR"] - p["back"]))

    g0 = (-hl + 0.02) if kind == "van" else p["back"]
    gx = [g0 + (p["ws"] - g0) * i / 14 for i in range(15)]
    hwB, hwT = hw - 0.05, hw - (0.2 if kind != "van" else 0.1)
    grings = []
    for x in gx:
        zbt = top_at(x) - 0.01
        zr = max(roof_at(x), zbt + 0.03)
        grings.append([(x, hwB, zbt), (x, hwT, zr), (x, -hwT, zr), (x, -hwB, zbt)])
    mesh_obj("Greenhouse", loft(grings), M["Glass"], parent=root)

    def surf(x, t, side):
        zbt = top_at(x) - 0.01
        zr = max(roof_at(x), zbt + 0.03)
        return Vector((x, (hwB + (hwT - hwB) * t) * side, zbt + (zr - zbt) * t))

    def bar(name, a, b, th=0.075, wd=0.075):
        """Square-section strip from a to b (pillars), slightly proud of the glass."""
        axis = (b - a).normalized()
        up = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
        u = axis.cross(up).normalized() * wd / 2
        w = axis.cross(u).normalized() * th / 2
        sq = lambda c: [tuple(c + u + w), tuple(c - u + w), tuple(c - u - w), tuple(c + u - w)]
        mesh_obj(name, loft([sq(a), sq(b)]), M["Paint"], parent=root)

    # roof skin (paint) slightly larger than the glass roof
    rx0, rx1 = (p["roofR"] if kind != "van" else g0), p["roofF"]
    roof_rings = []
    for x in (rx0 - 0.02, (rx0 + rx1) / 2, rx1 + 0.02):
        z = H + 0.006
        roof_rings.append([(x, hwT + 0.03, z - 0.035), (x, hwT - 0.04, z + 0.012), (x, -hwT + 0.04, z + 0.012), (x, -hwT - 0.03, z - 0.035)])
    mesh_obj("Roof", loft(roof_rings), M["Paint"], parent=root)
    xa_top = p["roofF"] + 0.02
    xbp = (p["roofF"] + (p["roofR"] if kind != "van" else p["roofF"] - 0.85)) / 2 + 0.1
    for side, nm in ((1, "L"), (-1, "R")):
        o = Vector((0, 0.012 * side, 0))
        bar(f"Pillar_A_{nm}", surf(p["ws"] - 0.02, 0.0, side) + o, surf(xa_top, 1.0, side) + o)
        bar(f"Pillar_B_{nm}", surf(xbp, 0.0, side) + o, surf(xbp, 1.0, side) + o, 0.08, 0.1)
        if kind == "van":
            # cargo walls behind the cab doors (no rear side glass)
            xc = p["roofF"] - 0.85
            walls = [[(x, (hwB + 0.012) * side, p["belt"] - 0.01), (x, (hwT + 0.012) * side, H + 0.002)] for x in (g0, xc)]
            bm = bmesh.new()
            vs = [bm.verts.new(Vector(v)) for v in (walls[0][0], walls[1][0], walls[1][1], walls[0][1])]
            bm.faces.new(vs)
            mesh_obj(f"CargoWall_{nm}", bm, M["Paint"], parent=root)
        else:
            # C pillar: a broad painted panel on the rear quarter
            xc0 = p["back"] + (0.05 if kind != "saloon" else 0.02)
            xc1 = p["roofR"] + (0.28 if kind in ("hatch",) else 0.18)
            quad = [surf(xc0, 0.0, side), surf(xc0 + (0.5 if kind != "saloon" else 0.3), 0.0, side), surf(xc1, 1.0, side), surf(p["roofR"] - 0.03, 1.0, side)]
            bm = bmesh.new()
            vs = [bm.verts.new(q + Vector((0, 0.014 * side, 0))) for q in quad]
            bm.faces.new(vs)
            mesh_obj(f"Pillar_C_{nm}", bm, M["Paint"], parent=root)
            bar(f"Pillar_Cedge_{nm}", surf(xc0 + (0.5 if kind != "saloon" else 0.3), 0.0, side) + o, surf(xc1, 1.0, side) + o, 0.06, 0.06)
    if kind == "van":
        bm = bmesh.new()
        x = g0 - 0.005
        vs = [bm.verts.new(Vector(v)) for v in ((x, -hwB, top_at(g0)), (x, hwB, top_at(g0)), (x, hwT, H), (x, -hwT, H))]
        bm.faces.new(vs)
        mesh_obj("RearDoors", bm, M["Paint"], parent=root)

    # ---- bumpers, grille, lamps, mirrors
    chrome = M["Chrome"] if v["family"] in ("saloon", "coupe") else M["Trim"]
    box("Bumper_F", (0.16, W + 0.04, 0.16), (hl + 0.02, 0, zb + 0.16), chrome, root)
    box("Bumper_R", (0.16, W + 0.04, 0.16), (-hl - 0.02, 0, zb + 0.16), chrome, root)
    ly = p["hood"] - 0.2
    box("Grille", (0.04, W * 0.42, 0.14), (hl + 0.005, 0, ly), M["Trim"], root)
    for s in (1, -1):
        box(f"Lamp_Head_{'L' if s > 0 else 'R'}", (0.04, 0.28, 0.13), (hl + 0.005, s * (hw - 0.25), ly), M["HeadLamp"], root)
        box(f"Ind_{'L' if s > 0 else 'R'}_F", (0.04, 0.09, 0.07), (hl + 0.005, s * (hw - 0.06), ly), M["IndL" if s > 0 else "IndR"], root)
        tz = min(top_at(-hl + 0.1), p["belt"]) - 0.2
        box(f"Lamp_Tail_{'L' if s > 0 else 'R'}", (0.04, 0.26, 0.15), (-hl - 0.005, s * (hw - 0.25), tz), M["TailLamp"], root)
        box(f"Ind_{'L' if s > 0 else 'R'}_R", (0.04, 0.09, 0.15), (-hl - 0.005, s * (hw - 0.07), tz), M["IndL" if s > 0 else "IndR"], root)
        box(f"Mirror_{'L' if s > 0 else 'R'}", (0.1, 0.07, 0.11), (p["ws"] - 0.12, s * (hw + 0.1), p["belt"] + 0.08), M["Trim"], root)
        box(f"MirrorStalk_{'L' if s > 0 else 'R'}", (0.05, 0.12, 0.03), (p["ws"] - 0.1, s * (hw + 0.03), p["belt"] + 0.03), M["Trim"], root)
        box(f"Sill_{'L' if s > 0 else 'R'}", (d["wheelbase"] - 2 * r - 0.1, 0.03, 0.07), ((fx + rx) / 2, s * (hw + 0.005), zb + 0.05), M["Trim"], root)

    # ---- wheels (pivot at the hub)
    for (wx, name) in ((fx, "F"), (rx, "R")):
        for s, side in ((1, "L"), (-1, "R")):
            piv = link(bpy.data.objects.new(f"Wheel_{name}{side}", None), root)
            piv.location = (wx, s * (tw), r)
            t = cylinder(f"Tire_{name}{side}", r, 0.19, (0, 0, 0), M["Tire"], segs=18, parent=piv)
            h = cylinder(f"Hub_{name}{side}", r * 0.58, 0.2, (0, s * 0.005, 0), M["Hub"], segs=12, parent=piv, flat=True)

    # ---- plate mounts
    pf = link(bpy.data.objects.new("PlateMount_F", None), root)
    pf.location = (hl + 0.11, 0, zb + 0.18)
    pr = link(bpy.data.objects.new("PlateMount_R", None), root)
    pr.location = (-hl - 0.11, 0, min(top_at(-hl + 0.1), p["belt"]) - 0.4)

    # ---- interior (visible through the glass and from the driver's seat)
    ex, ey, ez = v["eye"]["x"], -v["eye"]["z"], v["eye"]["y"]
    box("Interior_Dash", (0.36, W - 0.16, 0.16), (p["ws"] - 0.3, 0, p["belt"] - 0.04), M["Dash"], root)
    box("Interior_Floor", (L * 0.5, W - 0.12, 0.04), ((p["ws"] + p["back"]) / 2, 0, zb + 0.12), M["Interior"], root)
    for s in (1, -1):
        box(f"Interior_Seat_{s}", (0.45, 0.48, 0.12), (ex - 0.05, s * abs(ey), ez - 0.72), M["Seat"], root)
        box(f"Interior_Back_{s}", (0.1, 0.48, 0.6), (ex - 0.32, s * abs(ey), ez - 0.38), M["Seat"], root, (0, math.radians(-12), 0))
    sw = link(bpy.data.objects.new("SteeringWheel", None), root)
    sw.location = (ex + 0.45, ey, ez - 0.32)
    sw.rotation_euler = (0, math.radians(-62), 0)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, segments=20, radius=0.18)
    ring = mesh_obj("SteeringRim", bm, M["Interior"], parent=sw)
    mod = ring.modifiers.new("sk", "SKIN")
    box("SteeringSpoke", (0.02, 0.34, 0.03), (0, 0, 0), M["Interior"], sw)
    gl = link(bpy.data.objects.new("GearLever", None), root)
    gl.location = (ex + 0.32, 0.02, zb + 0.3)
    box("GearStick", (0.025, 0.025, 0.3), (0, 0, 0.15), M["Chrome"], gl)
    box("GearKnob", (0.06, 0.06, 0.06), (0, 0, 0.31), M["Interior"], gl)
    return root


def build_truck(v, root, M):
    d = v["dims"]
    L, W, H = d["L"], d["W"], d["H"]
    hl, hw = L / 2, W / 2
    r = d["wheelR"]
    cabL = 1.95
    rings = []
    for x, zt, end in ((hl - cabL, 2.75, 1.0), (hl - 0.6, 2.75, 1.0), (hl - 0.18, 2.6, 0.98), (hl - 0.02, 1.6, 0.97), (hl, 1.0, 0.95)):
        rings.append(lower_section(x, 0.95, zt, hw * end))
    mesh_obj("Body", loft(rings), M["Paint"], parent=root)
    box("Glass_Front", (0.03, W - 0.3, 0.78), (hl - 0.07, 0, 2.1), M["Glass"], root, (0, math.radians(-9), 0))
    for s in (1, -1):
        box(f"Glass_Side_{s}", (0.8, 0.02, 0.6), (hl - 0.75, s * (hw + 0.005), 2.05), M["Glass"], root)
        box(f"Mirror_{'L' if s > 0 else 'R'}", (0.08, 0.06, 0.45), (hl - 0.32, s * (hw + 0.3), 2.0), M["Trim"], root)
        box(f"Lamp_Head_{'L' if s > 0 else 'R'}", (0.04, 0.32, 0.16), (hl + 0.005, s * (hw - 0.3), 1.12), M["HeadLamp"], root)
        box(f"Ind_{'L' if s > 0 else 'R'}_F", (0.04, 0.12, 0.1), (hl + 0.005, s * (hw - 0.08), 1.12), M["IndL" if s > 0 else "IndR"], root)
        box(f"Lamp_Tail_{'L' if s > 0 else 'R'}", (0.04, 0.3, 0.16), (-hl - 0.005, s * (hw - 0.3), 0.95), M["TailLamp"], root)
        box(f"Ind_{'L' if s > 0 else 'R'}_R", (0.04, 0.12, 0.16), (-hl - 0.005, s * (hw - 0.08), 0.95), M["IndL" if s > 0 else "IndR"], root)
    box("Grille", (0.04, W * 0.7, 0.5), (hl + 0.005, 0, 1.25), M["Trim"], root)
    box("Bumper_F", (0.2, W + 0.02, 0.3), (hl + 0.05, 0, 0.75), M["Trim"], root)
    for s in (0.45, -0.45):
        box(f"Rail_{s}", (L - 0.3, 0.12, 0.22), (-0.15, s, 0.78), M["Trim"], root)
    boxL = L - cabL - 0.25
    box("Cargo", (boxL, W, H - 1.0), (-hl + boxL / 2, 0, 1.0 + (H - 1.0) / 2), M["Paint"], root)
    for i in range(1, 6):
        box(f"Rib_{i}", (0.04, W + 0.02, H - 1.1), (-hl + boxL * i / 6, 0, 1.0 + (H - 1.0) / 2), M["Chrome"], root)
    fx = hl - 1.25
    rx = fx - d["wheelbase"]
    for (wx, nm) in ((fx, "F"), (rx, "R")):
        for s, side in ((1, "L"), (-1, "R")):
            piv = link(bpy.data.objects.new(f"Wheel_{nm}{side}", None), root)
            piv.location = (wx, s * (d["track"] / 2), r)
            cylinder(f"Tire_{nm}{side}", r, 0.3, (0, 0, 0), M["Tire"], segs=20, parent=piv)
            cylinder(f"Hub_{nm}{side}", r * 0.55, 0.32, (0, 0, 0), M["Hub"], segs=10, parent=piv, flat=True)
            if nm == "R":
                cylinder(f"Tire_{nm}{side}2", r, 0.3, (0, -s * 0.32, 0), M["Tire"], segs=20, parent=piv)
    pf = link(bpy.data.objects.new("PlateMount_F", None), root)
    pf.location = (hl + 0.17, 0, 0.75)
    pr = link(bpy.data.objects.new("PlateMount_R", None), root)
    pr.location = (-hl - 0.03, 0, 0.75)
    sw = link(bpy.data.objects.new("SteeringWheel", None), root)
    sw.location = (hl - 0.55, -v["eye"]["z"], 1.85)
    sw.rotation_euler = (0, math.radians(-30), 0)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, segments=20, radius=0.22)
    mesh_obj("SteeringRim", bm, M["Interior"], parent=sw)
    box("SteeringSpoke", (0.02, 0.4, 0.03), (0, 0, 0), M["Interior"], sw)
    gl = link(bpy.data.objects.new("GearLever", None), root)
    gl.location = (hl - 0.9, 0, 1.25)
    box("GearStick", (0.03, 0.03, 0.45), (0, 0, 0.22), M["Chrome"], gl)
    box("Interior_Dash", (0.4, W - 0.2, 0.2), (hl - 0.3, 0, 1.65), M["Dash"], root)
    return root


def preview(v, path):
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_WORKBENCH"
    scn.display.shading.light = "STUDIO"
    scn.display.shading.color_type = "MATERIAL"
    scn.display.shading.show_shadows = True
    scn.display.shading.show_cavity = True
    scn.render.resolution_x, scn.render.resolution_y = 900, 520
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    scn.collection.objects.link(cam)
    L = v["dims"]["L"]
    cam.location = (L * 1.15, L * 0.95, L * 0.55)
    target = Vector((0, 0, v["dims"]["H"] * 0.45))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 40
    scn.camera = cam
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def main():
    with open(SPEC) as f:
        vehicles = json.load(f)
    os.makedirs(OUT, exist_ok=True)
    for v in vehicles:
        if ONLY and v["id"] != ONLY:
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        root = build_vehicle(v)
        if PREVIEW:
            preview(v, os.path.join(os.path.dirname(SPEC), "previews", v["id"] + ".png"))
        out = os.path.join(OUT, v["id"] + ".glb")
        bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True, export_yup=True,
                                  export_cameras=False, export_lights=False)
        tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
        print(f"[krug] exported {v['id']} → {out} ({tris} faces, {len(bpy.data.materials)} materials)")


main()
