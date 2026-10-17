import { SampleApproach, SampleWarp } from "./interaction-stages.js?v=29244eede89b";

const Green = "#68d3b0";
const Pink = "#e8a6ce";
const Blue = "#80a8ff";
const Yellow = "#e6c589";
const Muted = "#b4a9c7";

function Line(Context, Points, Color, Dash = [], Width = 2)
{
    Context.beginPath();
    Context.strokeStyle = Color;
    Context.lineWidth = Width;
    Context.lineCap = "round";
    Context.lineJoin = "round";
    Context.setLineDash(Dash);
    Points.forEach(function(Point, Index)
    {
        if (Index === 0)
        {
            Context.moveTo(Point.X, Point.Y);
            return;
        }

        Context.lineTo(Point.X, Point.Y);
    });
    Context.stroke();
    Context.setLineDash([]);
}

function Circle(Context, Point, Radius, Color, Filled = true)
{
    Context.beginPath();
    Context.arc(Point.X, Point.Y, Radius, 0, Math.PI * 2);

    if (Filled)
    {
        Context.fillStyle = Color;
        Context.fill();
        return;
    }

    Context.strokeStyle = Color;
    Context.lineWidth = 1.5;
    Context.stroke();
}

function Label(Context, Value, Point, Color = Muted, Align = "center")
{
    Context.fillStyle = Color;
    Context.font = '500 12px "Pretendard Variable", sans-serif';
    Context.textAlign = Align;
    Context.fillText(Value, Point.X, Point.Y);
}

function Avatar(Context, Point, Yaw, Color)
{
    Context.save();
    Context.translate(Point.X, Point.Y);
    Context.rotate(-Yaw * Math.PI / 180);
    Context.fillStyle = Color;
    Context.beginPath();
    Context.moveTo(17, 0);
    Context.lineTo(-10, -9);
    Context.lineTo(-6, 0);
    Context.lineTo(-10, 9);
    Context.closePath();
    Context.fill();
    Context.restore();
}

function MakeView(Points, Width, Height)
{
    const MinX = Math.min(...Points.map(function(Point)
    {
        return Point.X;
    }));
    const MaxX = Math.max(...Points.map(function(Point)
    {
        return Point.X;
    }));
    const MinY = Math.min(...Points.map(function(Point)
    {
        return Point.Y;
    }));
    const MaxY = Math.max(...Points.map(function(Point)
    {
        return Point.Y;
    }));
    const Scale = Math.min((Width - 86) / Math.max(140, MaxX - MinX), (Height - 92) / Math.max(140, MaxY - MinY));

    return {
        Scale,
        Point(Value)
        {
            return { X: Width / 2 + (Value.X - (MinX + MaxX) / 2) * Scale, Y: Height / 2 - (Value.Y - (MinY + MaxY) / 2) * Scale };
        }
    };
}

function Grid(Context, Width, Height)
{
    for (let X = 20; X < Width; X += 30)
    {
        Line(Context, [{ X, Y: 30 }, { X, Y: Height - 25 }], "#2c2439", [], 1);
    }

    for (let Y = 35; Y < Height - 20; Y += 30)
    {
        Line(Context, [{ X: 20, Y }, { X: Width - 20, Y }], "#2c2439", [], 1);
    }
}

function DrawApproach(Context, Width, Height, Model, Amount)
{
    if (Model.Enabled === false || Model.HasSpot === false)
    {
        Grid(Context, Width, Height);
        Avatar(Context, { X: Width / 2, Y: Height / 2 }, 0, Green);
        Label(Context, "PreMove 생략 → 첫 스텝", { X: Width / 2, Y: Height / 2 + 36 }, Green);
        return;
    }

    const Radius = Model.Limit + 15;
    const End = Model.Playback[Model.Playback.length - 1].Position;
    const View = MakeView([Model.Start, End, Model.Goal, Model.CandidateA, Model.CandidateB, { X: -Radius, Y: -Radius }, { X: Radius, Y: Radius }], Width, Height);
    const Origin = View.Point({ X: 0, Y: 0 });
    const Sample = SampleApproach(Model, Amount);
    const Position = View.Point(Sample.Position);
    const Goal = View.Point(Model.Goal);
    Grid(Context, Width, Height);
    Circle(Context, Origin, Radius * View.Scale, Blue, false);
    Circle(Context, Origin, Math.max(0, Model.BaseLimit * View.Scale), "#4b4367", false);
    Line(Context, [View.Point(Model.Start), Goal], Blue, [5, 5]);
    Circle(Context, View.Point(Model.CandidateA), 5, "#706b87");
    Circle(Context, View.Point(Model.CandidateB), 5, "#706b87");
    Label(Context, "A", { X: View.Point(Model.CandidateA).X, Y: View.Point(Model.CandidateA).Y - 13 });
    Label(Context, "B", { X: View.Point(Model.CandidateB).X + 13, Y: View.Point(Model.CandidateB).Y - 13 });
    Circle(Context, Origin, 6, Pink);
    Label(Context, "접근 지점", { X: Origin.X, Y: Origin.Y + 24 }, Pink);
    Line(Context, [{ X: Goal.X - 7, Y: Goal.Y - 7 }, { X: Goal.X + 7, Y: Goal.Y + 7 }], Blue);
    Line(Context, [{ X: Goal.X + 7, Y: Goal.Y - 7 }, { X: Goal.X - 7, Y: Goal.Y + 7 }], Blue);
    Label(Context, "목적지 " + Model.GoalName, { X: Goal.X, Y: Goal.Y + 35 }, Blue);
    let Direction = Math.atan2(Model.Goal.Y - Sample.Position.Y, Model.Goal.X - Sample.Position.X) * 180 / Math.PI;

    if (Number.isFinite(Sample.ForwardYaw))
    {
        Direction = Sample.ForwardYaw;
    }
    let CharacterColor = Green;

    if (Sample.Cancelled)
    {
        CharacterColor = "#ef9da9";
    }

    Avatar(Context, Position, Direction, CharacterColor);
    Label(Context, "캐릭터", { X: Position.X, Y: Position.Y - 22 }, CharacterColor);
    let BoundaryLabel = "표시 경계 " + Radius.toFixed(1) + " cm · 거리 보정 15 포함";

    if (Width < 400)
    {
        BoundaryLabel = "표시 경계 " + Radius.toFixed(1) + " cm";
    }

    Label(Context, BoundaryLabel, { X: Width / 2, Y: 21 }, Blue);
    Label(Context, Sample.ElapsedTime.toFixed(2) + " s · 판정 거리 " + Sample.MeasuredDistance.toFixed(1) + " cm", { X: Width / 2, Y: Height - 10 }, CharacterColor);
}

function DrawWarp(Context, Width, Height, Model, Amount)
{
    const Points = [Model.Start, ...Object.values(Model.Targets).filter(function(Target)
    {
        return Target !== null;
    })];
    const View = MakeView(Points, Width, Height);
    const Position = SampleWarp(Model, Amount);
    Grid(Context, Width, Height);
    Model.Segments.forEach(function(Segment)
    {

        if (Segment.WarpTranslation && Segment.MissingTarget === false)
        {
            Line(Context, [View.Point(Segment.From), View.Point(Segment.To)], Blue, [5, 5]);
        }
    });
    const TargetColors = { Interaction: Blue, Root: Pink, Handle: Yellow };
    Object.entries(Model.Targets).forEach(function([Name, Target])
    {
        if (Target === null)
        {
            return;
        }

        const Point = View.Point(Target);
        Circle(Context, Point, 7, TargetColors[Name], false);
        let Offset = 25;

        if (Name === "Handle")
        {
            Offset = -17;
        }

        Label(Context, Name, { X: Point.X, Y: Point.Y + Offset }, TargetColors[Name]);
    });

    const Active = Model.Segments.find(function(Segment)
    {
        return Segment.Index === Position.NotifyIndex;
    });

    if (Active && Active.WarpRotation && Active.MissingTarget === false)
    {
        Line(Context, [View.Point(Position), View.Point(Model.Targets[Active.TargetName])], Yellow, [3, 6], 1);
    }

    Avatar(Context, View.Point(Position), Position.Yaw, Green);
    const Current = View.Point(Position);
    Label(Context, "캐릭터", { X: Current.X, Y: Current.Y - 29 }, Green);
    Label(Context, Position.NotifyLabel, { X: Width / 2, Y: 21 });
    Label(Context, Position.Time.toFixed(1) + " / " + Model.Duration + " s · " + Position.Yaw.toFixed(1) + "°", { X: Width / 2, Y: Height - 10 }, Green);
}

function DrawTilt(Context, Width, Height, Model, Amount)
{
    let HalfHeight = 88;
    let HipHeight = 82;
    let ShoulderHeight = 135;

    if (Model.Stance === "crouch")
    {
        HalfHeight = 60;
        HipHeight = 48;
        ShoulderHeight = 94;
    }

    const FootZ = Model.CapsuleZ - HalfHeight;
    const MaximumZ = Math.max(FootZ + 185, Model.Target.Z + 30, Model.Origin.Z + 35);
    const MinimumZ = Math.min(-20, FootZ, Model.Target.Z - 10, Model.Origin.Z - 10);
    const MinX = Math.min(-40, Model.Origin.X - 15);
    const MaxX = Math.max(90, Model.Target.X + 30, Model.Origin.X + 25);
    const Scale = Math.min((Height - 76) / (MaximumZ - MinimumZ), (Width - 70) / (MaxX - MinX));
    const OffsetX = (Width - (MaxX - MinX) * Scale) / 2 - MinX * Scale;
    const Bottom = Height - 42;

    function Point(X, Z)
    {
        return { X: OffsetX + X * Scale, Y: Bottom - (Z - MinimumZ) * Scale };
    }

    const Ground = Point(0, FootZ);
    Line(Context, [{ X: 18, Y: Ground.Y }, { X: Width - 18, Y: Ground.Y }], "#60516f");
    const Hip = Point(0, FootZ + HipHeight);
    const Bend = -Model.Pitch * Math.PI / 180 * 0.7 * Amount;
    const TorsoLength = (ShoulderHeight - HipHeight) * Scale;
    const Shoulder = { X: Hip.X + Math.sin(Bend) * TorsoLength, Y: Hip.Y - Math.cos(Bend) * TorsoLength };
    const Head = { X: Shoulder.X + Math.sin(Bend) * 25 * Scale, Y: Shoulder.Y - Math.cos(Bend) * 25 * Scale };
    const BackFoot = Point(-14, FootZ);
    const FrontFoot = Point(14, FootZ);
    Line(Context, [Hip, Point(-20, FootZ + HipHeight * 0.45), BackFoot], "#447768", [], 8 * Scale);
    Line(Context, [Hip, Point(22, FootZ + HipHeight * 0.45), FrontFoot], Green, [], 9 * Scale);
    Line(Context, [Hip, Shoulder], Green, [], 12 * Scale);
    Line(Context, [Shoulder, Head], Green, [], 7 * Scale);
    Circle(Context, Head, 12 * Scale, Green);
    const Target = Point(Model.Target.X, Model.Target.Z);
    const Hand = { X: Shoulder.X + 12 * Scale + (Target.X - Shoulder.X - 12 * Scale) * Amount, Y: Shoulder.Y + 55 * Scale + (Target.Y - Shoulder.Y - 55 * Scale) * Amount };
    Line(Context, [Shoulder, { X: (Shoulder.X + Hand.X) / 2 - 12 * Scale, Y: (Shoulder.Y + Hand.Y) / 2 + 12 * Scale }, Hand], "#a1e7cf", [], 6 * Scale);
    const Origin = Point(Model.Origin.X, Model.Origin.Z);
    const Capsule = Point(0, Model.CapsuleZ);
    Circle(Context, Capsule, 5, Blue, false);
    Line(Context, [Capsule, Origin], Blue, [3, 4], 1);
    Line(Context, [Origin, { X: Target.X, Y: Origin.Y }], Yellow, [4, 4], 1);
    Line(Context, [{ X: Target.X, Y: Origin.Y }, Target], Pink, [4, 4], 1);
    Line(Context, [Origin, Target], Pink, [], 1.5);
    Circle(Context, Origin, 5, Yellow);
    Circle(Context, Target, 7, Pink);
    if (Width < 400)
    {
        Label(Context, "상체 기준점", { X: Width / 2, Y: 46 }, Yellow);
    }
    else
    {
        Label(Context, "상체 기준점", { X: Origin.X - 9, Y: Origin.Y - 12 }, Yellow, "right");
    }
    Label(Context, "대상", { X: Target.X, Y: Target.Y + 22 }, Pink);
    Label(Context, "θ " + (Model.Pitch * Amount).toFixed(1) + "°", { X: Width / 2, Y: 22 }, Green);
    let FootLabel = "발 위치 유지 · 캡슐 중심 + 자세별 오프셋";

    if (Width < 400)
    {
        FootLabel = "발 위치 유지";
    }

    Label(Context, FootLabel, { X: Width / 2, Y: Height - 10 }, Muted);
}

export function DrawStageScene(Context, Width, Height, Stage, Model, Amount)
{
    if (Model === null)
    {
        Label(Context, "입력값을 확인하세요.", { X: Width / 2, Y: Height / 2 });
        return;
    }

    if (Stage === 1)
    {
        DrawApproach(Context, Width, Height, Model, Amount);
        return;
    }

    if (Stage === 2)
    {
        DrawWarp(Context, Width, Height, Model, Amount);
        return;
    }

    DrawTilt(Context, Width, Height, Model, Amount);
}
