import { EvaluateMontages, ChooseMontage } from "./montage-selection.js?v=2b8f4f090d74";
import { CalculateApproach, SampleApproach, CalculateWarp, SampleWarp, CalculateTilt } from "./interaction-stages.js?v=29244eede89b";
import { DrawStageScene } from "./interaction-renderers.js?v=0126122d57c8";

const Lab = document.getElementById("montage-lab");
const Canvas = document.getElementById("montage-canvas");
const Context2D = Canvas.getContext("2d");
const Source = document.getElementById("montage-source");
const HeightInput = document.getElementById("montage-height");
const FootInput = document.getElementById("montage-foot");
const Stance = document.getElementById("montage-stance");
const HeightInputs = Array.from(Lab.querySelectorAll("[data-montage-height]"));
const StageButtons = Array.from(Lab.querySelectorAll("[data-montage-stage]"));
const StagePanels = Array.from(Lab.querySelectorAll("[data-stage-panel]"));
const RunButtons = Array.from(Lab.querySelectorAll("[data-run-stage]"));
const Confirm = document.getElementById("montage-confirm");
const PlayState = document.getElementById("montage-play-state");
const SelectionTitle = document.getElementById("montage-selection-title");
const SelectionReason = document.getElementById("montage-selection-reason");
const StageHelp = document.getElementById("montage-stage-help");
const MotionEnabled = document.getElementById("montage-motion");
const ReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const Names = ["동작 A", "동작 B", "동작 C", "동작 D"];
const StageNames = ["몽타주 동작", "자동 접근", "위치·방향 정렬", "상체 자세 보정"];
const Colors = { Ink: "#f7f5fc", Muted: "#aaa0be", Grid: "#342b43", Pink: "#e8a6ce", Green: "#68d3b0", Yellow: "#e6c589", Blue: "#80a8ff" };
let HandleHeight = 20;
let ActorHeight = 75;
let Selection = null;
let Committed = null;
let CurrentStage = 0;
let AnimationFrame = 0;
let Progress = 0;
let StartTime = 0;
let Dragging = false;
let SceneGeometry = null;
let SceneModel = null;
let HasRun = false;

function Clamp(Value, Minimum, Maximum)
{
    return Math.max(Minimum, Math.min(Maximum, Value));
}

function Smooth(Value)
{
    const Amount = Clamp(Value, 0, 1);
    return Amount * Amount * (3 - 2 * Amount);
}

function Lerp(From, To, Amount)
{
    return From + (To - From) * Amount;
}

function Signed(Value)
{
    if (Value > 0)
    {
        return "+" + Value;
    }

    return String(Value);
}

function GetConditions()
{
    const FootHeight = Number(FootInput.value);
    return { TargetHeight: Number(HeightInput.value), FootHeight, ReferenceHeight: FootHeight, RelativeHeight: Number(HeightInput.value) - FootHeight, HeightResolvable: true, Stance: Stance.value };
}

function GetRows()
{
    return HeightInputs.map(function(Input, Index)
    {
        return { Id: Index, Name: Names[Index], Height: Number(Input.value), PoseHeight: Index * 30, Priority: 0, IgnoreHeight: false, HasAsset: true, Stance: "any" };
    });
}

function StopAnimation()
{
    window.cancelAnimationFrame(AnimationFrame);
    AnimationFrame = 0;
}

function SetStage(Stage)
{
    CurrentStage = Stage;
    StageButtons.forEach(function(Button, Index)
    {
        Button.disabled = false;
        Button.setAttribute("aria-pressed", String(Index === Stage));
    });
    StagePanels.forEach(function(Panel, Index)
    {
        Panel.hidden = Index !== Stage;
    });
    const Labels = ["SIDE VIEW / 높이 기반 선택", "TOP VIEW / 자동 접근", "TOP VIEW / 위치·방향 정렬", "SIDE VIEW / 상체 자세 보정"];
    const Help = ["대상 기둥을 누르거나 분홍 점을 위아래로 끌어 높이를 바꾸세요. 아래 입력으로도 조절할 수 있습니다.", "두 투영 후보와 도착 경계를 표시합니다. 아래 접근 데이터를 조절한 뒤 실행하세요.", "세 워프 목표를 구분해 표시합니다. 아래 위치와 방향을 설정한 뒤 실행하세요.", "상체 기준점과 대상 사이의 높이·수평 거리를 표시합니다. 아래 자세별 오프셋을 조절한 뒤 실행하세요."];
    Help[2] = "Interaction · Root · Handle을 구분해 표시합니다. 노티파이별 Target Name과 위치·회전 보정을 설정해 실행하세요.";
    document.getElementById("montage-scene-label").textContent = Labels[Stage];
    Lab.querySelector(".montage-scene-help").textContent = Help[Stage];
    Canvas.style.cursor = "default";

    if (Stage === 0)
    {
        Canvas.style.cursor = "grab";
    }
}

function SelectStage(Stage)
{
    StopAnimation();
    HasRun = false;
    Progress = 0;
    SetStage(Stage);

    if (Stage === 0)
    {
        UpdateSelection();
        return;
    }

    RefreshStageData();
}

function ReadStageValues(Stage)
{
    const Values = {};
    StagePanels[Stage].querySelectorAll("[data-stage-value]").forEach(function(Input)
    {
        if (Input.type === "checkbox")
        {
            Values[Input.dataset.stageValue] = Input.checked;
            return;
        }

        if (Input.type === "number")
        {
            Values[Input.dataset.stageValue] = Number(Input.value);
            return;
        }

        Values[Input.dataset.stageValue] = Input.value;
    });

    if (Stage === 2)
    {
        Values.Notifies = [1, 2].map(function(Number, Index)
        {
            const Prefix = "Notify" + Number;
            return { Index, Enabled: Values[Prefix + "Enabled"], Start: Values[Prefix + "Start"], End: Values[Prefix + "End"], TargetName: Values[Prefix + "Target"], WarpTranslation: Values[Prefix + "Translation"], WarpRotation: Values[Prefix + "Rotation"], RotationMode: Values[Prefix + "RotationMode"] };
        });
    }

    return Values;
}

function UpdateWarpControls()
{
    const Panel = StagePanels[2];
    Panel.querySelectorAll("[data-warp-notify]").forEach(function(Row)
    {
        const Prefix = "Notify" + (Number(Row.dataset.warpNotify) + 1);
        const Enabled = Row.querySelector('[data-stage-value="' + Prefix + 'Enabled"]').checked;
        Row.querySelectorAll("[data-stage-value]").forEach(function(Input)
        {
            if (Input.dataset.stageValue !== Prefix + "Enabled")
            {
                Input.disabled = Enabled === false;
            }
        });
        Row.querySelector('[data-stage-value="' + Prefix + 'RotationMode"]').disabled = Enabled === false || Row.querySelector('[data-stage-value="' + Prefix + 'Rotation"]').checked === false;
    });
    ["Interaction", "Handle"].forEach(function(Name)
    {
        const Target = Panel.querySelector('[data-warp-target="' + Name + '"]');
        const Enabled = Target.querySelector('input[type="checkbox"]').checked;
        Target.querySelectorAll('input[type="number"]').forEach(function(Input)
        {
            Input.disabled = Enabled === false;
        });
    });
}

function RejectStageData(Message)
{
    SceneModel = null;
    RunButtons[CurrentStage].disabled = true;
    GetStageStatus().textContent = Message;
    StagePanels[CurrentStage].querySelectorAll("[data-stage-output]").forEach(function(Output)
    {
        Output.textContent = "—";
    });
    DrawScene();
}

function NumberText(Value)
{
    return Number(Value.toFixed(1)).toLocaleString("ko-KR");
}

function PointText(Point)
{
    return "(" + NumberText(Point.X) + ", " + NumberText(Point.Y) + ") cm";
}

function SetOutput(Key, Value)
{
    StagePanels[CurrentStage].querySelector('[data-stage-output="' + Key + '"]').textContent = Value;
}

function GetStageStatus()
{
    const Ids = [null, "approach-result", "warp-result", "tilt-result"];
    return document.getElementById(Ids[CurrentStage]);
}

function RefreshStageData()
{
    StopAnimation();
    Progress = 0;
    HasRun = false;

    if (CurrentStage === 2)
    {
        UpdateWarpControls();
        StagePanels[2].querySelectorAll("[data-warp-notify]").forEach(function(Row)
        {
            Row.dataset.active = "false";
        });
    }

    const Inputs = Array.from(StagePanels[CurrentStage].querySelectorAll('input[type="number"]'));
    const Valid = Inputs.every(function(Input)
    {
        return Input.disabled || (Input.value !== "" && Input.validity.valid);
    });
    RunButtons[CurrentStage].disabled = Valid === false;
    PlayState.textContent = "데이터 설정 중";
    StageHelp.textContent = "단계를 선택해도 자동으로 실행되지 않습니다. 데이터를 조절한 뒤 해당 단계의 실행 버튼을 누르세요.";

    if (Valid === false)
    {
        RejectStageData("입력값의 범위와 단위를 확인하세요.");
        return;
    }

    const Input = ReadStageValues(CurrentStage);

    if (CurrentStage === 1)
    {
        SceneModel = CalculateApproach(Input);
        GetStageStatus().textContent = "이동 필요 · 실행 대기";

        if (SceneModel.NeedsMove === false)
        {
            GetStageStatus().textContent = "이동을 생략하는 조건입니다. 실행해 판정을 확인하세요.";
        }
    }
    else if (CurrentStage === 2)
    {
        SceneModel = CalculateWarp(Input);

        if (SceneModel.Errors.length > 0)
        {
            RejectStageData(SceneModel.Errors[0]);
            return;
        }

        GetStageStatus().textContent = "노티파이 " + SceneModel.Segments.length + "개 · 타깃별 위치·회전 보정 실행 대기";
    }
    else
    {
        SceneModel = CalculateTilt(Input);
        GetStageStatus().textContent = "보정 각도 " + NumberText(SceneModel.Pitch) + "° · 실행 대기";
    }

    Canvas.setAttribute("aria-label", StageNames[CurrentStage] + " 장면. 아래 데이터와 계산 결과를 조절해 실행할 수 있습니다.");
    UpdateStageMetrics();
    DrawScene();
}

function UpdateStageMetrics()
{
    if (CurrentStage === 0 || SceneModel === null)
    {
        return;
    }

    const Amount = Smooth(Progress / 0.8);

    if (CurrentStage === 1)
    {
        const Sample = SampleApproach(SceneModel, Progress);
        SetOutput("CostA", NumberText(SceneModel.CostA) + " cm");
        SetOutput("CostB", NumberText(SceneModel.CostB) + " cm");
        SetOutput("Goal", SceneModel.GoalName + " · " + PointText(SceneModel.Goal));
        SetOutput("BaseLimit", NumberText(SceneModel.BaseLimit) + " cm");
        SetOutput("AdditionalMargin", NumberText(SceneModel.AdditionalMargin) + " cm");
        SetOutput("Limit", NumberText(SceneModel.Limit) + " cm");
        SetOutput("MeasuredDistance", NumberText(Sample.MeasuredDistance) + " cm");
        let Arrival = "도착 콜백 대기";

        if (Sample.Arrived)
        {
            Arrival = "도착 콜백 → 이동 정지 → 첫 스텝";
        }

        if (HasRun && Sample.Cancelled)
        {
            Arrival = "이동 취소";
        }

        if (SceneModel.Enabled === false || SceneModel.HasSpot === false)
        {
            Arrival = "판정 생략";
        }

        SetOutput("Arrival", Arrival);
        SetOutput("TickTime", NumberText(Sample.ElapsedTime) + " s");
        const TickNames = { move: "이동 명령 → 도착 대기 시작", moving: "도착 검사 · 범위 밖", periodic: "서버 주기 검사 통과 · 도착 검사 생략", arrived: "도착 검사 통과", cancelled: "서버 취소 판정", skipped: "PreMove 생략 → 첫 스텝" };
        const Reasons = { deviation: "방향 이탈", stuck: "거리 변화 부족", timeout: "시간 초과" };
        let Decision = TickNames[Sample.Event];

        if (Sample.Cancelled)
        {
            Decision += " · " + Reasons[Sample.Reason];
        }

        SetOutput("TickResult", Decision);
        const Trace = SceneModel.Playback.filter(function(Frame)
        {
            return Frame.ElapsedTime <= Sample.ElapsedTime && Frame.Event !== "moving";
        }).map(function(Frame)
        {
            let Message = NumberText(Frame.ElapsedTime) + " s · " + TickNames[Frame.Event];

            if (Frame.Reason)
            {
                Message += " · " + Reasons[Frame.Reason];
            }

            return Message;
        });
        SetOutput("Trace", Trace.join("\n"));

        if (SceneModel.Enabled === false || SceneModel.HasSpot === false)
        {
            ["CostA", "CostB", "Goal", "BaseLimit", "AdditionalMargin", "Limit"].forEach(function(Key)
            {
                SetOutput(Key, "계산 생략");
            });
        }

        return;
    }

    if (CurrentStage === 2)
    {
        const Position = SampleWarp(SceneModel, Progress);
        SetOutput("Root", PointText(SceneModel.Targets.Root));
        SetOutput("Interaction", PointText(SceneModel.Targets.Interaction));
        SetOutput("Handle", "등록 없음");

        if (SceneModel.Targets.Handle)
        {
            SetOutput("Handle", PointText(SceneModel.Targets.Handle));
        }
        SetOutput("Position", PointText(Position));
        SetOutput("Yaw", NumberText(Position.Yaw) + "°");
        SetOutput("Time", NumberText(Position.Time) + " / " + NumberText(SceneModel.Duration) + " s");
        SetOutput("ActiveNotify", Position.NotifyLabel);

        if (HasRun === false)
        {
            SetOutput("ActiveNotify", "실행 대기");
        }

        StagePanels[2].querySelectorAll("[data-warp-notify]").forEach(function(Row)
        {
            Row.dataset.active = String(AnimationFrame !== 0 && Number(Row.dataset.warpNotify) === Position.NotifyIndex);
        });
        return;
    }

    SetOutput("Origin", "(" + NumberText(SceneModel.Origin.X) + ", " + NumberText(SceneModel.Origin.Z) + ") cm");
    SetOutput("Target", "(" + NumberText(SceneModel.Target.X) + ", " + NumberText(SceneModel.Target.Z) + ") cm");
    SetOutput("Horizontal", NumberText(SceneModel.HorizontalDistance) + " cm");
    SetOutput("Height", NumberText(SceneModel.HeightDifference) + " cm");
    SetOutput("Pitch", NumberText(SceneModel.Pitch) + "°");
    SetOutput("AppliedPitch", NumberText(SceneModel.Pitch * Amount) + "°");
}

function UpdateSelection()
{
    StopAnimation();
    Progress = 0;
    Committed = null;
    HasRun = false;
    const Conditions = GetConditions();
    Canvas.setAttribute("aria-label", "몽타주 선택 장면. 대상 높이 " + Conditions.TargetHeight + " cm, 기준점 " + Conditions.ReferenceHeight + " cm, 상대 높이 " + Conditions.RelativeHeight + " cm. 아래 선택 결과에서 판정을 확인할 수 있습니다.");
    const Valid = HeightInputs.every(function(Input)
    {
        return Input.value !== "" && Input.validity.valid;
    });
    Selection = EvaluateMontages(GetRows(), Conditions);
    Confirm.disabled = Valid === false || Selection.BestRows.length === 0;
    document.getElementById("montage-height-output").textContent = HeightInput.value + " cm";
    document.getElementById("montage-foot-output").textContent = FootInput.value + " cm";
    document.getElementById("montage-target-value").textContent = Conditions.TargetHeight + " cm";
    document.getElementById("montage-reference-value").textContent = Conditions.ReferenceHeight + " cm";
    document.getElementById("montage-difference").textContent = Signed(Conditions.RelativeHeight) + " cm";
    document.getElementById("montage-height-label").textContent = "Handle 높이";
    document.getElementById("montage-reference-note").textContent = "대상 조작점의 Z에서 캐릭터 발 높이를 뺍니다. Handle이 없으면 대상 액터의 위치를 사용합니다.";

    if (Source.value === "actor")
    {
        document.getElementById("montage-height-label").textContent = "대상 원점 높이 · Transform Location Z";
    }


    Selection.Evaluations.forEach(function(Evaluation)
    {
        const RowElement = Lab.querySelector('[data-montage-row="' + Evaluation.Row.Id + '"]');
        const Result = Lab.querySelector('[data-montage-result="' + Evaluation.Row.Id + '"]');
        RowElement.dataset.state = "candidate";
        Result.textContent = "후보";

        if (Evaluation.Reason !== "candidate")
        {
            RowElement.dataset.state = "excluded";
            Result.textContent = "제외";
            return;
        }

        if (Selection.BestRows.includes(Evaluation.Row))
        {
            RowElement.dataset.state = "best";
            Result.textContent = "선택 예정";
        }
    });

    PlayState.textContent = "조건 설정 중";
    StageHelp.textContent = "높이 상한은 선택 조건입니다. 값을 바꾼 뒤 선택을 완료해 동작을 재생하세요.";

    if (Valid === false)
    {
        SelectionTitle.textContent = "높이 상한을 확인하세요";
        SelectionReason.textContent = "모든 행에 0~180 사이의 정수를 입력해 주세요.";
        DrawScene();
        return;
    }

    if (Selection.BestRows.length === 0)
    {
        SelectionTitle.textContent = "일치하는 몽타주 없음";
        SelectionReason.textContent = Signed(Conditions.RelativeHeight) + " cm를 수용하는 행이 없습니다. 대상 높이나 행의 상한을 조절하세요.";
        DrawScene();
        return;
    }

    const Best = Selection.BestRows[0];
    SelectionTitle.textContent = Best.Name + " · 상한 " + Best.Height + " cm";
    SelectionReason.textContent = Signed(Conditions.RelativeHeight) + " cm를 수용하는 가장 작은 상한은 " + Best.Height + " cm입니다.";

    if (Selection.BestRows.length > 1)
    {
        SelectionTitle.textContent = "동률 후보 " + Selection.BestRows.length + "개 · 상한 " + Best.Height + " cm";
        SelectionReason.textContent = "우선순위와 높이 상한이 같아 선택 완료 시 무작위로 한 동작을 고릅니다.";
    }

    DrawScene();
}

function PlayStage(Stage)
{
    if (RunButtons[Stage].disabled)
    {
        return;
    }

    StopAnimation();
    HasRun = true;

    if (Stage === 0)
    {
        Committed = ChooseMontage(Selection.BestRows);
        SelectionTitle.textContent = Committed.Name + " 선택 완료 · 상한 " + Committed.Height + " cm";
        Selection.Evaluations.forEach(function(Evaluation)
        {
            if (Evaluation.Row.Id === Committed.Id)
            {
                Lab.querySelector('[data-montage-result="' + Committed.Id + '"]').textContent = "선택 완료";
                return;
            }

            if (Selection.BestRows.includes(Evaluation.Row))
            {
                Lab.querySelector('[data-montage-result="' + Evaluation.Row.Id + '"]').textContent = "동률 후보";
            }
        });
    }

    PlayState.textContent = StageNames[Stage] + " 실행 중";

    if (Stage > 0)
    {
        GetStageStatus().textContent = PlayState.textContent;
    }

    if (MotionEnabled.checked === false || (Stage === 1 && SceneModel.NeedsMove === false))
    {
        Progress = 1;
        FinishStage();
        return;
    }

    Progress = 0;
    StartTime = performance.now();
    AnimationFrame = window.requestAnimationFrame(Animate);
}

function FinishStage()
{
    AnimationFrame = 0;
    let Status = StageNames[CurrentStage] + " 완료";

    if (CurrentStage === 1)
    {
        if (SceneModel.NeedsMove === false)
        {
            Status = "자동 접근 생략 · 범위 안";
            const Input = ReadStageValues(1);

            if (Input.Enabled === false)
            {
                Status = "자동 접근 생략 · 사용 안 함";
            }
            else if (Input.HasSpot === false)
            {
                Status = "자동 접근 생략 · 유효 지점 없음";
            }
        }
        else
        {
            const Sample = SampleApproach(SceneModel, 1);
            Status = "관찰 종료 · 도착 또는 서버 취소 통지 대기";

            if (Sample.Cancelled)
            {
                const Reasons = { deviation: "방향 이탈", stuck: "거리 변화 부족", timeout: "시간 초과" };
                Status = "서버 취소 · " + Reasons[Sample.Reason] + " → 이동 정지·상호작용 취소";
            }
            else if (Sample.Arrived)
            {
                Status = "도착 콜백 → 이동 정지 → 첫 스텝 시작";
            }
        }
    }
    else if (CurrentStage === 2)
    {
        Status = "MotionWarp 노티파이 재생 완료";

        if (SceneModel.Segments.some(function(Segment)
        {
            return Segment.MissingTarget;
        }))
        {
            Status += " · Handle 미등록 구간 생략";
        }
    }

    PlayState.textContent = Status;

    if (CurrentStage > 0)
    {
        GetStageStatus().textContent = Status;
    }

    UpdateStageMetrics();
    DrawScene();
}

function Animate(Time)
{
    let Duration = 2800;

    if (CurrentStage === 1 || CurrentStage === 2)
    {
        Duration = SceneModel.Duration * 1000;
    }

    Progress = Clamp((Time - StartTime) / Duration, 0, 1);
    UpdateStageMetrics();
    DrawScene();

    if (Progress < 1)
    {
        AnimationFrame = window.requestAnimationFrame(Animate);
        return;
    }

    FinishStage();
}

function Stroke(Points, Color, Width = 2, Dash = [])
{
    Context2D.beginPath();
    Context2D.strokeStyle = Color;
    Context2D.lineWidth = Width;
    Context2D.lineCap = "round";
    Context2D.lineJoin = "round";
    Context2D.setLineDash(Dash);
    Points.forEach(function(Point, Index)
    {
        if (Index === 0)
        {
            Context2D.moveTo(Point[0], Point[1]);
            return;
        }

        Context2D.lineTo(Point[0], Point[1]);
    });
    Context2D.stroke();
    Context2D.setLineDash([]);
}

function Circle(X, Y, Radius, Color)
{
    Context2D.beginPath();
    Context2D.fillStyle = Color;
    Context2D.arc(X, Y, Radius, 0, Math.PI * 2);
    Context2D.fill();
}

function Text(Value, X, Y, Color = Colors.Muted, Align = "left", Size = 12)
{
    Context2D.fillStyle = Color;
    Context2D.font = "500 " + Size + 'px "Pretendard Variable", sans-serif';
    Context2D.textAlign = Align;
    Context2D.fillText(Value, X, Y);
}

function DrawLimb(Start, End, Length, Bend, Color, Width)
{
    const X = End[0] - Start[0];
    const Y = End[1] - Start[1];
    const Distance = Math.hypot(X, Y);
    const Offset = Math.sqrt(Math.max(0, Length * Length - Distance * Distance / 4));
    const Angle = Math.atan2(Y, X);
    const Middle = [(Start[0] + End[0]) / 2 - Math.sin(Angle) * Offset * Bend, (Start[1] + End[1]) / 2 + Math.cos(Angle) * Offset * Bend];
    Stroke([Start, Middle, End], Color, Width);
    Circle(Middle[0], Middle[1], Width * 0.55, Color);
}

function DrawScene()
{
    const Bounds = Canvas.getBoundingClientRect();
    const Width = Bounds.width;
    const Height = Bounds.height;

    if (Width === 0 || Height === 0)
    {
        return;
    }

    const PixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    if (Canvas.width !== Math.round(Width * PixelRatio) || Canvas.height !== Math.round(Height * PixelRatio))
    {
        Canvas.width = Math.round(Width * PixelRatio);
        Canvas.height = Math.round(Height * PixelRatio);
    }

    Context2D.setTransform(PixelRatio, 0, 0, PixelRatio, 0, 0);
    Context2D.clearRect(0, 0, Width, Height);

    if (CurrentStage > 0)
    {
        SceneGeometry = null;
        let Amount = Smooth(Progress / 0.8);

        if (CurrentStage === 1 || CurrentStage === 2)
        {
            Amount = Progress;
        }

        DrawStageScene(Context2D, Width, Height, CurrentStage, SceneModel, Amount);
        return;
    }
    const Conditions = GetConditions();
    const Floor = Height - 46;
    const MaximumGuide = Math.max(...GetRows().map(function(Row)
    {
        return Clamp(Row.Height, 0, 180);
    }));
    const Scale = (Height - 90) / Math.max(205, Conditions.TargetHeight + 38, Conditions.FootHeight + 190, Conditions.ReferenceHeight + MaximumGuide + 25);
    const ObjectX = Width * 0.77;
    const TargetY = Floor - Conditions.TargetHeight * Scale;
    const ReferenceY = Floor - Conditions.ReferenceHeight * Scale;
    const Amount = Smooth(Progress / 0.8);
    const CharacterDistance = Math.min(120 * Scale, Width * 0.33);
    let CharacterX = ObjectX - CharacterDistance;
    let MotionAmount = 0;
    let Selected = null;

    if (Selection && Selection.BestRows.length > 0)
    {
        Selected = Selection.BestRows[0];
    }

    if (Committed)
    {
        Selected = Committed;
    }

    if (Committed && CurrentStage === 0)
    {
        MotionAmount = Amount;
    }

    for (let X = 18; X < Width; X += 32)
    {
        Stroke([[X, Floor + 6], [X - 22, Height]], Colors.Grid, 1);
    }

    Stroke([[16, Floor], [Width - 16, Floor]], "#60516f", 1.5);
    Stroke([[16, Floor + 18], [Width - 16, Floor + 18]], Colors.Grid, 1);
    Text("Z = 0", 18, Floor + 36, Colors.Muted, "left", 11);

    const GuideHeights = Array.from(new Set(GetRows().map(function(Row)
    {
        return Row.Height;
    })));

    for (const Threshold of GuideHeights)
    {
        const Y = ReferenceY - Threshold * Scale;
        Stroke([[30, Y], [ObjectX + 26, Y]], "#43364f", 1, [3, 5]);
        Text(String(Threshold), 17, Y - 5, Colors.Muted, "left", 11);
    }

    const ObjectTop = Floor - Math.max(65, Conditions.TargetHeight + 14) * Scale;
    const ObjectWidth = Math.max(24, Math.min(48, Width * 0.09));
    Stroke([[ObjectX, 36], [ObjectX, Floor + 20]], "#59415c", 1, [3, 5]);
    Context2D.fillStyle = "#352b43";
    Context2D.strokeStyle = "#655273";
    Context2D.lineWidth = 1;
    Context2D.fillRect(ObjectX - ObjectWidth / 2, ObjectTop, ObjectWidth, Floor - ObjectTop);
    Context2D.strokeRect(ObjectX - ObjectWidth / 2, ObjectTop, ObjectWidth, Floor - ObjectTop);
    Stroke([[ObjectX + ObjectWidth / 2, ObjectTop], [ObjectX + ObjectWidth / 2 + 10, ObjectTop + 8], [ObjectX + ObjectWidth / 2 + 10, Floor - 2], [ObjectX + ObjectWidth / 2, Floor]], "#655273", 1);

    let MotionHeight = 0;

    if (Selected)
    {
        MotionHeight = Selected.PoseHeight;
        const NominalY = Floor - (Conditions.FootHeight + MotionHeight) * Scale;
        Stroke([[ObjectX - 28, NominalY], [ObjectX + 27, NominalY]], Colors.Yellow, 2, [4, 3]);
        Context2D.strokeStyle = Colors.Yellow;
        Context2D.strokeRect(ObjectX - 5, NominalY - 5, 10, 10);
    }

    const FootY = Floor - Conditions.FootHeight * Scale;
    let BaseHipHeight = 82;
    let BaseShoulderHeight = 135;

    if (Stance.value === "crouch")
    {
        BaseHipHeight = 48;
        BaseShoulderHeight = 94;
    }

    const AbsoluteMotionHeight = MotionHeight;
    const LowAmount = 1 - Clamp(AbsoluteMotionHeight / 100, 0, 1);
    const HipHeight = BaseHipHeight - LowAmount * 25 * MotionAmount;
    const Hip = [CharacterX - LowAmount * 15 * Scale * MotionAmount, FootY - HipHeight * Scale];
    const Tilt = LowAmount * 0.9 * MotionAmount;
    let Shoulder = [Hip[0] + Math.sin(Tilt) * 52 * Scale, Hip[1] - Math.cos(Tilt) * (BaseShoulderHeight - BaseHipHeight) * Scale];
    const NominalHandY = Floor - (Conditions.FootHeight + MotionHeight) * Scale;
    let DesiredHandY = NominalHandY;

    const Head = [Shoulder[0] + Math.sin(Tilt) * 15 * Scale, Shoulder[1] - 25 * Scale];
    const RestHand = [Shoulder[0] + 14 * Scale, Shoulder[1] + 62 * Scale];
    const Hand = [Lerp(RestHand[0], ObjectX - 9, MotionAmount), Lerp(RestHand[1], DesiredHandY, MotionAmount)];
    let Step = 0;


    Context2D.fillStyle = "rgba(0,0,0,0.3)";
    Context2D.beginPath();
    Context2D.ellipse(CharacterX, FootY + 4, 29 * Scale, 6, 0, 0, Math.PI * 2);
    Context2D.fill();
    const BackFoot = [CharacterX - 14 * Scale - Step, FootY - Math.max(0, Step * 0.35)];
    const FrontFoot = [CharacterX + 13 * Scale + Step, FootY - Math.max(0, -Step * 0.35)];
    DrawLimb(Hip, BackFoot, 45 * Scale, 1, "#447768", 8 * Scale);
    DrawLimb(Hip, FrontFoot, 45 * Scale, 1, Colors.Green, 9 * Scale);
    Stroke([[BackFoot[0] - 6, BackFoot[1]], [BackFoot[0] + 11, BackFoot[1]]], "#447768", 6 * Scale);
    Stroke([[FrontFoot[0] - 6, FrontFoot[1]], [FrontFoot[0] + 12, FrontFoot[1]]], Colors.Green, 6 * Scale);
    Stroke([Hip, Shoulder], Colors.Green, 13 * Scale);
    Stroke([Shoulder, Head], Colors.Green, 7 * Scale);
    Circle(Head[0], Head[1], 13 * Scale, Colors.Green);
    Circle(Head[0] + 7 * Scale, Head[1] - 1, 2, "#193d34");
    DrawLimb(Shoulder, Hand, 46 * Scale, 1, "#a1e7cf", 6 * Scale);
    Circle(Hand[0], Hand[1], 4 * Scale, "#d1f6e6");

    Stroke([[CharacterX - 27, ReferenceY], [ObjectX - 17, ReferenceY]], Colors.Green, 1, [6, 4]);
    Circle(CharacterX, ReferenceY, 4, Colors.Green);
    const ArrowX = Math.min(Width - 17, ObjectX + ObjectWidth / 2 + 26);
    Stroke([[ArrowX, ReferenceY], [ArrowX, TargetY]], Colors.Pink, 1.5);
    Stroke([[ArrowX - 4, ReferenceY], [ArrowX + 4, ReferenceY]], Colors.Pink, 1.5);
    Stroke([[ArrowX - 4, TargetY], [ArrowX + 4, TargetY]], Colors.Pink, 1.5);
    Circle(ObjectX, TargetY, 14, "rgba(232,166,206,0.12)");
    Circle(ObjectX, TargetY, 7, Colors.Pink);
    Text(Signed(Conditions.RelativeHeight) + " cm", ArrowX - 3, Math.max(25, Math.min(TargetY, ReferenceY) - 15), Colors.Pink, "right", 12);
    let ReferenceName = "발 기준";


    Text(ReferenceName, CharacterX - 8, Math.min(Height - 12, ReferenceY + 21), Colors.Green, "right", 11);
    let TargetName = "Handle";

    if (Source.value === "actor")
    {
        TargetName = "대상 원점";
    }

    Text(TargetName, ObjectX, Math.max(18, ObjectTop - 14), Colors.Pink, "center", 12);
    Text("○ 실제 조작점   □ 동작 기준 높이", Width / 2, 20, Colors.Muted, "center", 11);
    SceneGeometry = { ObjectX, TargetY, Floor, Scale };


}

HeightInput.addEventListener("input", function()
{
    if (Source.value === "handle")
    {
        HandleHeight = Number(HeightInput.value);
    }
    else
    {
        ActorHeight = Number(HeightInput.value);
    }

    UpdateSelection();
});

Source.addEventListener("change", function()
{
    HeightInput.value = String(ActorHeight);

    if (Source.value === "handle")
    {
        HeightInput.value = String(HandleHeight);
    }

    UpdateSelection();
});

[FootInput, Stance, ...HeightInputs].forEach(function(Input)
{
    Input.addEventListener("input", UpdateSelection);
});

Lab.querySelectorAll("[data-height-preset]").forEach(function(Button)
{
    Button.addEventListener("click", function()
    {
        HeightInput.value = String(Clamp(GetConditions().ReferenceHeight + Number(Button.dataset.heightPreset), -30, 220));
        HeightInput.dispatchEvent(new Event("input"));
    });
});

RunButtons.forEach(function(Button)
{
    Button.addEventListener("click", function()
    {
        PlayStage(Number(Button.dataset.runStage));
        Canvas.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
});

StageButtons.forEach(function(Button, Index)
{
    Button.addEventListener("click", function()
    {
        SelectStage(Index);
    });
});

StagePanels.forEach(function(Panel, Index)
{
    Panel.querySelectorAll("[data-stage-value]").forEach(function(Input)
    {
        Input.addEventListener("input", function()
        {
            if (CurrentStage === Index)
            {
                RefreshStageData();
            }
        });
    });
});

document.getElementById("montage-reset").addEventListener("click", function()
{
    StagePanels[CurrentStage].querySelectorAll("input, select").forEach(function(Input)
    {
        if (Input.type === "checkbox")
        {
            Input.checked = Input.defaultChecked;
            return;
        }

        if (Input.tagName === "SELECT")
        {
            const DefaultIndex = Array.from(Input.options).findIndex(function(Option)
            {
                return Option.defaultSelected;
            });
            Input.selectedIndex = Math.max(0, DefaultIndex);
            return;
        }

        Input.value = Input.defaultValue;
    });

    if (CurrentStage === 0)
    {
        HandleHeight = 20;
        ActorHeight = 75;
        UpdateSelection();
        return;
    }

    RefreshStageData();
});

Lab.querySelectorAll("[data-warp-preset]").forEach(function(Button)
{
    Button.addEventListener("click", function()
    {
        const Preset = Button.dataset.warpPreset;
        const Split = Preset === "split";
        const Values = { Duration: 3, Notify1Enabled: true, Notify1Start: 0, Notify1End: 3, Notify1Target: "Interaction", Notify1Translation: true, Notify1Rotation: Preset === "both", Notify1RotationMode: "match", Notify2Enabled: Split, Notify2Start: 1.5, Notify2End: 3, Notify2Target: "Handle", Notify2Translation: false, Notify2Rotation: true, Notify2RotationMode: "facing" };

        if (Split)
        {
            Values.Notify1End = 1.5;
        }

        if (Preset === "root")
        {
            Values.Notify1Target = "Root";
        }

        Object.entries(Values).forEach(function([Key, Value])
        {
            const Input = StagePanels[2].querySelector('[data-stage-value="' + Key + '"]');

            if (Input.type === "checkbox")
            {
                Input.checked = Value;
                return;
            }

            Input.value = String(Value);
        });
        RefreshStageData();
    });
});

document.getElementById("interaction-demo-toggle").addEventListener("click", function()
{
    const Expanded = Lab.hidden;
    Lab.hidden = Expanded === false;
    this.setAttribute("aria-expanded", String(Expanded));
    this.setAttribute("aria-label", "상호작용 데모 접기");
    document.getElementById("interaction-demo-toggle-label").textContent = "데모 접기 −";

    if (Expanded === false)
    {
        StopAnimation();
        this.setAttribute("aria-label", "상호작용 데모 펼치기");
        document.getElementById("interaction-demo-toggle-label").textContent = "직접 확인해 보기 +";
        return;
    }

    SelectStage(CurrentStage);
});

Canvas.addEventListener("pointerdown", function(Event)
{
    if (CurrentStage !== 0 || SceneGeometry === null)
    {
        return;
    }

    const Bounds = Canvas.getBoundingClientRect();
    const Distance = Math.abs(Event.clientX - Bounds.left - SceneGeometry.ObjectX);

    if (Distance > 28)
    {
        return;
    }

    Dragging = true;
    Canvas.setPointerCapture(Event.pointerId);
    Canvas.style.cursor = "grabbing";
    UpdateHeightFromPointer(Event);
});

function UpdateHeightFromPointer(PointerInput)
{
    const Bounds = Canvas.getBoundingClientRect();
    HeightInput.value = String(Clamp(Math.round((SceneGeometry.Floor - PointerInput.clientY + Bounds.top) / SceneGeometry.Scale), -30, 220));
    HeightInput.dispatchEvent(new Event("input"));
}

Canvas.addEventListener("pointermove", function(Event)
{
    if (Dragging === false)
    {
        return;
    }

    UpdateHeightFromPointer(Event);
});

function EndDrag()
{
    Dragging = false;
    Canvas.style.cursor = "grab";
}

Canvas.addEventListener("pointerup", EndDrag);
Canvas.addEventListener("pointercancel", EndDrag);
Canvas.addEventListener("lostpointercapture", EndDrag);
MotionEnabled.checked = ReducedMotion.matches === false;

if (ReducedMotion.matches)
{
    document.getElementById("montage-motion-note").textContent = "기기에서 동작 줄이기가 켜져 있습니다. 체크하면 움직임을 재생합니다.";
}

MotionEnabled.addEventListener("change", function()
{
    document.getElementById("montage-motion-note").textContent = "끄면 최종 자세만 표시합니다.";

    if (MotionEnabled.checked === false && AnimationFrame)
    {
        StopAnimation();
        Progress = 1;
        FinishStage();
    }
});
document.addEventListener("visibilitychange", function()
{
    if (document.hidden && AnimationFrame)
    {
        StopAnimation();
        Progress = 1;
        FinishStage();
    }
});
new ResizeObserver(DrawScene).observe(Canvas);
document.fonts.ready.then(DrawScene);
SetStage(0);
UpdateSelection();
