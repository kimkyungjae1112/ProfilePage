function Distance(Point)
{
    return Math.hypot(Point.X, Point.Y);
}

function Between(First, Second)
{
    return Math.hypot(First.X - Second.X, First.Y - Second.Y);
}

export function CalculateApproach(Input)
{
    const Start = { X: Input.StartX, Y: Input.StartY };
    const StartDistance = Distance(Start);
    let DirectionX = 0;
    let DirectionY = 0;

    if (StartDistance > 0)
    {
        DirectionX = Start.X / StartDistance;
        DirectionY = Start.Y / StartDistance;
    }

    const CandidateA = { X: DirectionX * Input.ApproachDistance + Input.ProjectionAX, Y: DirectionY * Input.ApproachDistance + Input.ProjectionAY };
    const CandidateB = { X: Input.ProjectionBX, Y: Input.ProjectionBY };
    const CostA = Between(Start, CandidateA);
    const CostB = Between(Start, CandidateB);
    let Goal = CandidateA;
    let GoalName = "A";

    if (CostB < CostA)
    {
        Goal = CandidateB;
        GoalName = "B";
    }

    const BaseLimit = Input.ApproachDistance + Input.ArrivalMargin;
    const AdditionalMargin = Math.max(0, Distance(Goal) - BaseLimit);
    const Limit = BaseLimit + AdditionalMargin;
    const NeedsMove = Input.Enabled && Input.HasSpot && StartDistance - 15 >= Limit;
    const Model = { Start, CandidateA, CandidateB, CostA, CostB, Goal, GoalName, BaseLimit, AdditionalMargin, Limit, NeedsMove, Scenario: Input.Scenario, Enabled: Input.Enabled, HasSpot: Input.HasSpot };
    Model.Playback = SimulateApproach(Model, Input);
    Model.Duration = Model.Playback[Model.Playback.length - 1].ElapsedTime;
    return Model;
}

export function CreateApproachState(FirstCheckTime)
{
    return { ElapsedTime: 0, NextCheckTime: FirstCheckTime, PreviousDistance: 0, DistanceInitialized: false, Status: "moving", Reason: "", Event: "move", ArrivalChecked: false, PeriodicChecked: false };
}

export function TickApproach(Previous, Input, Settings)
{
    if (Previous.Status !== "moving")
    {
        return Previous;
    }

    const State = { ...Previous, ElapsedTime: Previous.ElapsedTime + Input.DeltaTime, Position: { ...Input.Position }, ForwardYaw: Input.ForwardYaw, MeasuredDistance: Between(Input.Position, Input.Spot) - 15, Event: "moving", ArrivalChecked: false, PeriodicChecked: false };

    if (State.DistanceInitialized === false)
    {
        State.PreviousDistance = State.MeasuredDistance;
        State.DistanceInitialized = true;
    }

    if (Input.IsAuthority)
    {
        if (State.ElapsedTime >= State.NextCheckTime)
        {
            State.NextCheckTime += Settings.CheckInterval;
            State.PeriodicChecked = true;
            const DirectionX = Input.PathPoint.X - Input.Position.X;
            const DirectionY = Input.PathPoint.Y - Input.Position.Y;
            const Length = Math.hypot(DirectionX, DirectionY);
            let Dot = 0;

            if (Length * Length > 0.0001)
            {
                const ForwardRadians = Input.ForwardYaw * Math.PI / 180;
                Dot = DirectionX / Length * Math.cos(ForwardRadians) + DirectionY / Length * Math.sin(ForwardRadians);
            }

            State.DirectionAngle = Math.acos(Math.max(-1, Math.min(1, Dot))) * 180 / Math.PI;

            if (State.DirectionAngle > Settings.CancelDegreeThreshold)
            {
                State.Status = "cancelled";
                State.Reason = "deviation";
                State.Event = "cancelled";
                return State;
            }

            if (Math.abs(State.MeasuredDistance - State.PreviousDistance) < Settings.CancelDistanceThreshold)
            {
                State.Status = "cancelled";
                State.Reason = "stuck";
                State.Event = "cancelled";
                return State;
            }

            State.PreviousDistance = State.MeasuredDistance;
            State.Event = "periodic";
            return State;
        }

        if (State.ElapsedTime > Settings.CancelTimeThreshold)
        {
            State.Status = "cancelled";
            State.Reason = "timeout";
            State.Event = "cancelled";
            return State;
        }
    }

    State.ArrivalChecked = true;

    if (State.MeasuredDistance < Input.Limit)
    {
        State.Status = "arrived";
        State.Event = "arrived";
    }

    return State;
}

function SimulateApproach(Model, Input)
{
    // Playback inputs are illustrative. TickApproach preserves the supplied branch order.
    const Settings = { CheckInterval: 0.5, CancelDegreeThreshold: 90, CancelDistanceThreshold: 1, CancelTimeThreshold: 5 };
    let State = { ...CreateApproachState(0.5), Position: { ...Model.Start }, MeasuredDistance: Distance(Model.Start) - 15 };

    if (Model.NeedsMove === false)
    {
        State.Status = "skipped";
        State.Event = "skipped";
        return [State];
    }

    const Playback = [State];
    const DeltaTime = 1 / 30;
    const PathLength = Between(Model.Start, Model.Goal);
    let DirectionX = 0;
    let DirectionY = 0;
    let Speed = 120;

    if (PathLength > 0)
    {
        DirectionX = (Model.Goal.X - Model.Start.X) / PathLength;
        DirectionY = (Model.Goal.Y - Model.Start.Y) / PathLength;
    }

    if (Number.isFinite(Input.MoveSpeed))
    {
        Speed = Input.MoveSpeed;
    }

    for (let Index = 1; Index <= 240; Index++)
    {
        let Movement = Math.min(PathLength, Speed * Index * DeltaTime);
        let ForwardYaw = Math.atan2(DirectionY, DirectionX) * 180 / Math.PI;

        if (Model.Scenario === "stuck")
        {
            Movement = 0;
        }
        else if (Model.Scenario === "deviation")
        {
            ForwardYaw += 180;
        }
        else if (Model.Scenario === "timeout")
        {
            Movement = -Speed * Index * DeltaTime;
        }

        const Position = { X: Model.Start.X + DirectionX * Movement, Y: Model.Start.Y + DirectionY * Movement };
        State = TickApproach(State, { DeltaTime, Position, Spot: { X: 0, Y: 0 }, PathPoint: Model.Goal, ForwardYaw, Limit: Model.Limit, IsAuthority: Input.Authority !== "client" }, Settings);
        Playback.push(State);

        if (State.Status !== "moving")
        {
            break;
        }
    }

    return Playback;
}

export function SampleApproach(Model, Progress)
{
    const Time = Math.max(0, Math.min(1, Progress)) * Model.Duration;
    let Sample = Model.Playback[0];

    for (const Frame of Model.Playback)
    {
        if (Frame.ElapsedTime > Time + 1e-9)
        {
            break;
        }

        Sample = Frame;
    }

    return { ...Sample, Arrived: Sample.Status === "arrived", Cancelled: Sample.Status === "cancelled" };
}

export function CalculateWarp(Input)
{
    const Start = { X: Input.StartX, Y: Input.StartY, Yaw: Input.StartYaw };
    let Interaction = { X: Input.SpotX, Y: Input.SpotY, Yaw: Input.SpotYaw };

    if (Input.HasSpot === false)
    {
        Interaction = { ...Start };
    }

    let Handle = null;

    if (Input.HasHandle)
    {
        Handle = { X: Input.HandleX, Y: Input.HandleY, Yaw: Input.HandleYaw };
    }

    const Targets = { Interaction, Root: { X: Input.RootX, Y: Input.RootY, Yaw: Input.RootYaw }, Handle };
    const Notifies = Input.Notifies.filter(function(Notify)
    {
        return Notify.Enabled;
    }).sort(function(First, Second)
    {
        return First.Start - Second.Start;
    });
    const Errors = [];
    let PreviousEnd = 0;

    Notifies.forEach(function(Notify, Index)
    {
        if (Notify.Start < 0 || Notify.End > Input.Duration || Notify.Start >= Notify.End)
        {
            Errors.push("노티파이의 시작·종료 시간을 몽타주 길이 안에서 설정하세요.");
        }

        if (Index > 0 && Notify.Start < PreviousEnd)
        {
            Errors.push("데모의 노티파이 구간은 겹치지 않게 설정하세요.");
        }

        if (Object.hasOwn(Targets, Notify.TargetName) === false)
        {
            Errors.push("등록된 Target Name을 선택하세요.");
        }

        PreviousEnd = Notify.End;
    });

    let Pose = { ...Start };
    const Segments = Notifies.map(function(Notify)
    {
        const Target = Targets[Notify.TargetName];
        const From = { ...Pose };
        const To = { ...Pose };

        if (Target)
        {
            if (Notify.WarpTranslation)
            {
                To.X = Target.X;
                To.Y = Target.Y;
            }

            if (Notify.WarpRotation)
            {
                let TargetYaw = Target.Yaw;

                if (Notify.RotationMode === "facing")
                {
                    let DirectionX = Target.X - To.X;
                    let DirectionY = Target.Y - To.Y;

                    if (DirectionX === 0 && DirectionY === 0)
                    {
                        DirectionX = Target.X - From.X;
                        DirectionY = Target.Y - From.Y;
                    }

                    TargetYaw = From.Yaw;

                    if (DirectionX !== 0 || DirectionY !== 0)
                    {
                        TargetYaw = Math.atan2(DirectionY, DirectionX) * 180 / Math.PI;
                    }
                }

                const Delta = ((TargetYaw - From.Yaw + 540) % 360 + 360) % 360 - 180;
                To.Yaw = From.Yaw + Delta;
            }
        }

        Pose = { ...To };
        return { ...Notify, From, To, MissingTarget: Target === null };
    });

    return { Start, Targets, Segments, Duration: Input.Duration, Errors, FinalPose: Pose };
}

export function SampleWarp(Model, Progress)
{
    const Time = Math.max(0, Math.min(1, Progress)) * Model.Duration;
    let Pose = { ...Model.Start };

    for (const Segment of Model.Segments)
    {
        if (Time < Segment.Start)
        {
            break;
        }

        if (Time >= Segment.End)
        {
            Pose = { ...Segment.To };
            continue;
        }

        const Fraction = (Time - Segment.Start) / (Segment.End - Segment.Start);
        const Amount = Fraction * Fraction * (3 - 2 * Fraction);
        let NotifyLabel = String(Segment.Index + 1).padStart(2, "0") + " · " + Segment.TargetName;

        if (Segment.MissingTarget)
        {
            NotifyLabel += " 미등록 · 생략";
        }

        return { X: Segment.From.X + (Segment.To.X - Segment.From.X) * Amount, Y: Segment.From.Y + (Segment.To.Y - Segment.From.Y) * Amount, Yaw: Segment.From.Yaw + (Segment.To.Yaw - Segment.From.Yaw) * Amount, Time, NotifyIndex: Segment.Index, NotifyLabel };
    }

    let NotifyLabel = "노티파이 구간 밖";

    if (Progress >= 1)
    {
        NotifyLabel = "재생 완료";
    }

    return { ...Pose, Time, NotifyIndex: -1, NotifyLabel };
}

export function CalculateTilt(Input)
{
    let OffsetX = Input.StandOffsetX;
    let OffsetZ = Input.StandOffsetZ;

    if (Input.Stance === "crouch")
    {
        OffsetX = Input.CrouchOffsetX;
        OffsetZ = Input.CrouchOffsetZ;
    }

    let TargetZ = Input.HandleZ;

    if (Input.Source === "actor")
    {
        TargetZ = Input.ActorZ;
    }

    const Origin = { X: OffsetX, Z: Input.CapsuleZ + OffsetZ };
    const HorizontalDistance = Math.abs(Input.TargetX - Origin.X);
    const HeightDifference = TargetZ - Origin.Z;
    let Pitch = 0;

    if (HorizontalDistance !== 0 || HeightDifference !== 0)
    {
        Pitch = Math.atan2(HeightDifference, HorizontalDistance) * 180 / Math.PI;
    }

    return { Origin, Target: { X: Input.TargetX, Z: TargetZ }, HorizontalDistance, HeightDifference, Pitch, Stance: Input.Stance, CapsuleZ: Input.CapsuleZ, Source: Input.Source };
}
