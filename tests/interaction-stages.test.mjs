import Test from "node:test";
import Assert from "node:assert/strict";
import { CalculateApproach, SampleApproach, CreateApproachState, TickApproach, CalculateWarp, SampleWarp, CalculateTilt } from "../assets/js/interaction-stages.js";

const Approach = { StartX: -320, StartY: 0, ApproachDistance: 150, ArrivalMargin: 60, ProjectionAX: 0, ProjectionAY: 0, ProjectionBX: 0, ProjectionBY: 0, Enabled: true, HasSpot: true, Scenario: "normal" };

Test("접근은 가까운 투영 후보를 선택하고 도착 판정에서 15를 뺀다", function()
{
    const Model = CalculateApproach(Approach);
    Assert.equal(Model.GoalName, "A");
    Assert.equal(Model.CostA, 170);
    Assert.equal(Model.Limit, 210);
    Assert.equal(Model.NeedsMove, true);
    const Arrival = SampleApproach(Model, 1);
    Assert.equal(Arrival.Arrived, true);
    Assert.equal(Arrival.Position.X, -224);
    Assert.ok(Arrival.Position.X < Model.Goal.X);
});

Test("접근 시작 경계는 포함하고 도착 경계는 엄격하게 비교한다", function()
{
    Assert.equal(CalculateApproach({ ...Approach, StartX: -225 }).NeedsMove, true);
    Assert.equal(CalculateApproach({ ...Approach, StartX: -224.9 }).NeedsMove, false);
    Assert.equal(SampleApproach(CalculateApproach({ ...Approach, StartX: -225 }), 0).Arrived, false);
});

Test("경계 밖으로 투영된 목적지는 추가 도착 여유를 반영한다", function()
{
    const Model = CalculateApproach({ ...Approach, ProjectionAX: -150 });
    Assert.equal(Model.Goal.X, -300);
    Assert.equal(Model.AdditionalMargin, 90);
    Assert.equal(Model.Limit, 300);
    Assert.equal(SampleApproach(Model, 1).Arrived, true);
});

Test("후보 B가 가까우면 B를, 비용이 같으면 A를 선택한다", function()
{
    Assert.equal(CalculateApproach({ ...Approach, ProjectionAX: 700 }).GoalName, "B");
    Assert.equal(CalculateApproach({ ...Approach, ProjectionAX: 150 }).GoalName, "A");
});

Test("접근 비활성·지점 없음·취소 시나리오를 구분한다", function()
{
    Assert.equal(CalculateApproach({ ...Approach, Enabled: false }).NeedsMove, false);
    Assert.equal(CalculateApproach({ ...Approach, HasSpot: false }).NeedsMove, false);
    const Failed = SampleApproach(CalculateApproach({ ...Approach, Scenario: "stuck" }), 1);
    Assert.equal(Failed.Cancelled, true);
    Assert.equal(Failed.Arrived, false);
});

const Checks = { CheckInterval: 1, CancelDegreeThreshold: 90, CancelDistanceThreshold: 2, CancelTimeThreshold: 3 };
const Tick = { DeltaTime: 0.1, Position: { X: -224, Y: 0 }, Spot: { X: 0, Y: 0 }, PathPoint: { X: -150, Y: 0 }, ForwardYaw: 0, Limit: 210, IsAuthority: true };

Test("도착은 실제 틱 위치를 사용하며 경계에서 0.1을 추가로 빼지 않는다", function()
{
    const State = CreateApproachState(1);
    Assert.equal(TickApproach(State, { ...Tick, Position: { X: -225, Y: 0 } }, Checks).Status, "moving");
    Assert.equal(TickApproach(State, { ...Tick, Position: { X: -224.99, Y: 0 } }, Checks).Status, "arrived");
});

Test("주기 검사 프레임은 도착·시간 초과 검사 전에 복귀한다", function()
{
    const Previous = { ...CreateApproachState(0), DistanceInitialized: true, PreviousDistance: 300, ElapsedTime: 4 };
    const State = TickApproach(Previous, Tick, Checks);
    Assert.equal(State.Status, "moving");
    Assert.equal(State.Event, "periodic");
    Assert.equal(State.ArrivalChecked, false);
    Assert.equal(State.NextCheckTime, 1);
    const Next = TickApproach({ ...State, NextCheckTime: 10 }, Tick, Checks);
    Assert.equal(Next.Reason, "timeout");
});

Test("방향 취소가 거리 변화 부족보다 먼저 판정된다", function()
{
    const Previous = { ...CreateApproachState(0), DistanceInitialized: true, PreviousDistance: 209 };
    const Result = TickApproach(Previous, { ...Tick, ForwardYaw: 180 }, Checks);
    Assert.equal(Result.Reason, "deviation");
    Assert.equal(Result.ArrivalChecked, false);
});

Test("첫 틱이 주기 검사 시점이면 첫 거리와 비교하므로 정체가 된다", function()
{
    const Result = TickApproach(CreateApproachState(0), Tick, Checks);
    Assert.equal(Result.Reason, "stuck");
});

Test("거리 변화 검사는 감소량 대신 절댓값을 사용한다", function()
{
    const Previous = { ...CreateApproachState(0), DistanceInitialized: true, PreviousDistance: 200 };
    Assert.equal(TickApproach(Previous, Tick, Checks).Event, "periodic");
});

Test("각도·거리 변화·시간 경계는 원본과 같은 엄격 비교를 쓴다", function()
{
    const Previous = { ...CreateApproachState(0), DistanceInitialized: true, PreviousDistance: 211 };
    const AtAngle = TickApproach(Previous, { ...Tick, ForwardYaw: 90 }, Checks);
    Assert.equal(AtAngle.Event, "periodic");
    const AtTime = TickApproach({ ...CreateApproachState(9), ElapsedTime: 2.9 }, { ...Tick, Position: { X: -300, Y: 0 } }, Checks);
    Assert.equal(AtTime.Status, "moving");
});

Test("클라이언트는 주기 취소·시간 초과를 건너뛰고 도착을 검사한다", function()
{
    const Previous = { ...CreateApproachState(0), ElapsedTime: 5 };
    const Result = TickApproach(Previous, { ...Tick, IsAuthority: false, ForwardYaw: 180 }, Checks);
    Assert.equal(Result.Status, "arrived");
    Assert.equal(Result.PeriodicChecked, false);
});

Test("시나리오 이름만으로 취소하지 않으며 먼저 도착하면 정상 진행한다", function()
{
    const Model = CalculateApproach({ ...Approach, StartX: -226, Scenario: "deviation" });
    Assert.equal(SampleApproach(Model, 1).Arrived, true);
    const Cancelled = SampleApproach(CalculateApproach({ ...Approach, Scenario: "deviation" }), 1);
    Assert.equal(Cancelled.Reason, "deviation");
});

Test("도착 대기 이후에는 새 틱이 결과를 바꾸지 않는다", function()
{
    const Arrived = TickApproach(CreateApproachState(1), Tick, Checks);
    Assert.equal(TickApproach(Arrived, { ...Tick, Position: { X: -400, Y: 0 } }, Checks), Arrived);
});

const Translation = { Index: 0, Enabled: true, Start: 0, End: 1.5, TargetName: "Interaction", WarpTranslation: true, WarpRotation: false, RotationMode: "match" };
const Rotation = { Index: 1, Enabled: true, Start: 1.5, End: 3, TargetName: "Handle", WarpTranslation: false, WarpRotation: true, RotationMode: "facing" };
const Warp = { StartX: -180, StartY: 60, StartYaw: 45, SpotX: -90, SpotY: 0, SpotYaw: 10, RootX: 0, RootY: 0, RootYaw: 0, HandleX: 0, HandleY: 40, HandleYaw: 90, HasSpot: true, HasHandle: true, Duration: 3, Notifies: [Translation, Rotation] };

Test("Interaction 이동 후 별도 Handle 노티파이로 회전한다", function()
{
    const Model = CalculateWarp(Warp);
    Assert.deepEqual(Model.Errors, []);
    Assert.deepEqual(Model.Targets.Root, { X: 0, Y: 0, Yaw: 0 });
    Assert.equal(SampleWarp(Model, 0.25).Yaw, 45);
    const Midpoint = SampleWarp(Model, 0.5);
    Assert.equal(Midpoint.X, -90);
    Assert.equal(Midpoint.Y, 0);
    Assert.equal(Midpoint.Yaw, 45);
    Assert.equal(Midpoint.NotifyIndex, 1);
    const End = SampleWarp(Model, 1);
    Assert.equal(End.X, -90);
    Assert.equal(End.Y, 0);
    Assert.ok(Math.abs(End.Yaw - Math.atan2(40, 90) * 180 / Math.PI) < 1e-10);
});

Test("Root 위치만 보정하면 캐릭터 방향을 유지한다", function()
{
    const Model = CalculateWarp({ ...Warp, Notifies: [{ ...Translation, TargetName: "Root" }] });
    Assert.equal(Model.FinalPose.X, 0);
    Assert.equal(Model.FinalPose.Y, 0);
    Assert.equal(Model.FinalPose.Yaw, 45);
});

Test("회전만 보정하면 위치를 유지하며 짧은 회전 경로를 쓴다", function()
{
    const Model = CalculateWarp({ ...Warp, StartYaw: 350, Notifies: [{ ...Rotation, TargetName: "Interaction", RotationMode: "match" }] });
    Assert.deepEqual(Model.FinalPose, { X: -180, Y: 60, Yaw: 370 });
});

Test("각 노티파이는 세 Target Name 중 어느 목표든 참조한다", function()
{
    for (const TargetName of ["Interaction", "Root", "Handle"])
    {
        const Model = CalculateWarp({ ...Warp, Notifies: [{ ...Translation, TargetName, WarpRotation: true }] });
        Assert.deepEqual(Model.FinalPose, Model.Targets[TargetName]);
    }
});

Test("스팟 폴백은 Interaction에만 적용하며 Root와 Handle을 유지한다", function()
{
    const Model = CalculateWarp({ ...Warp, HasSpot: false });
    Assert.deepEqual(Model.Targets.Interaction, Model.Start);
    Assert.notEqual(Model.Targets.Handle, null);
    Assert.deepEqual(CalculateWarp({ ...Warp, HasSpot: false, Notifies: [{ ...Translation, TargetName: "Root" }] }).FinalPose, { X: 0, Y: 0, Yaw: 45 });
});

Test("Handle 미등록 시 해당 구간만 생략한다", function()
{
    const Model = CalculateWarp({ ...Warp, HasHandle: false });
    Assert.equal(Model.Targets.Handle, null);
    Assert.deepEqual(Model.FinalPose, { X: -90, Y: 0, Yaw: 45 });
    Assert.equal(Model.Segments[1].MissingTarget, true);
});

Test("노티파이 구간 밖과 비활성 구간에서는 보정하지 않는다", function()
{
    const Model = CalculateWarp({ ...Warp, Notifies: [{ ...Translation, Start: 1, End: 2 }, { ...Rotation, Enabled: false }] });
    Assert.equal(SampleWarp(Model, 0.2).X, -180);
    Assert.equal(SampleWarp(Model, 0.2).NotifyIndex, -1);
    Assert.equal(SampleWarp(Model, 0.5).X, -135);
    Assert.equal(SampleWarp(Model, 0.9).X, -90);
    Assert.equal(SampleWarp(Model, 0.9).NotifyIndex, -1);
    Assert.equal(Model.FinalPose.Yaw, 45);
});

Test("겹침·길이 초과·미등록 타깃을 검증한다", function()
{
    Assert.ok(CalculateWarp({ ...Warp, Notifies: [Translation, { ...Rotation, Start: 1 }] }).Errors.length > 0);
    Assert.ok(CalculateWarp({ ...Warp, Duration: 2 }).Errors.length > 0);
    Assert.ok(CalculateWarp({ ...Warp, Notifies: [{ ...Translation, TargetName: "Unknown" }] }).Errors.length > 0);
    Assert.ok(CalculateWarp({ ...Warp, Notifies: [{ ...Translation, Start: 1.5 }] }).Errors.length > 0);
});

Test("위치·회전 보정이 모두 꺼진 구간과 빈 몽타주는 포즈를 유지한다", function()
{
    Assert.deepEqual(CalculateWarp({ ...Warp, Notifies: [] }).FinalPose, { X: -180, Y: 60, Yaw: 45 });
    Assert.deepEqual(CalculateWarp({ ...Warp, Notifies: [{ ...Translation, WarpTranslation: false }] }).FinalPose, { X: -180, Y: 60, Yaw: 45 });
});

const Tilt = { Stance: "stand", CapsuleZ: 88, StandOffsetX: 0, StandOffsetZ: 40, CrouchOffsetX: 10, CrouchOffsetZ: 5, TargetX: 120, HandleZ: 65, ActorZ: 0, Source: "handle" };

Test("상체 기준점은 캡슐 중심과 자세별 오프셋을 더한다", function()
{
    const Standing = CalculateTilt(Tilt);
    Assert.equal(Standing.Origin.Z, 128);
    Assert.equal(Standing.HeightDifference, -63);
    Assert.equal(Standing.Pitch, Math.atan2(-63, 120) * 180 / Math.PI);
    const Crouching = CalculateTilt({ ...Tilt, Stance: "crouch" });
    Assert.deepEqual(Crouching.Origin, { X: 10, Z: 93 });
    Assert.equal(Crouching.HorizontalDistance, 110);
});

Test("Handle이 없으면 대상 원점을 쓰며 영벡터 각도는 0이다", function()
{
    Assert.equal(CalculateTilt({ ...Tilt, Source: "actor" }).Target.Z, 0);
    Assert.equal(CalculateTilt({ ...Tilt, TargetX: 0, HandleZ: 128 }).Pitch, 0);
    Assert.equal(CalculateTilt({ ...Tilt, TargetX: 0, HandleZ: 200 }).Pitch, 90);
});
