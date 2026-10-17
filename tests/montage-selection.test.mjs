import Test from "node:test";
import Assert from "node:assert/strict";
import { EvaluateMontages, ChooseMontage } from "../assets/js/montage-selection.js";

function MakeRow(Id, Height, Changes = {})
{
    return { Id, Height, Priority: 0, IgnoreHeight: false, HasAsset: true, Stance: "any", ...Changes };
}

const Rows = [0, 30, 60, 90].map(function(Height)
{
    return MakeRow(String(Height), Height);
});

function Evaluate(RelativeHeight, InputRows = Rows, Changes = {})
{
    return EvaluateMontages(InputRows, { RelativeHeight, HeightResolvable: true, Stance: "stand", ...Changes });
}

Test("높이 상한은 경계를 포함하고 가장 작은 유효 상한을 선택한다", function()
{
    for (const [Height, Expected] of [[-20, "0"], [0, "0"], [20, "30"], [30, "30"], [31, "60"], [60, "60"], [61, "90"], [90, "90"]])
    {
        Assert.equal(Evaluate(Height).BestRows[0].Id, Expected);
    }

    Assert.equal(Evaluate(91).BestRows.length, 0);
    Assert.equal(ChooseMontage([]), null);
});

Test("높이보다 우선순위를 먼저 비교한다", function()
{
    const Result = Evaluate(20, [MakeRow("narrow", 30), MakeRow("priority", 90, { Priority: 2 })]);
    Assert.equal(Result.BestRows[0].Id, "priority");
});

Test("높이 무시 행은 동일 우선순위의 구체적인 행 뒤로 간다", function()
{
    const InputRows = [...Rows, MakeRow("fallback", 0, { IgnoreHeight: true })];
    Assert.equal(Evaluate(20, InputRows).BestRows[0].Id, "30");
    Assert.equal(Evaluate(120, InputRows).BestRows[0].Id, "fallback");
});

Test("태그는 정확 일치하며 비어 있는 조건은 통과한다", function()
{
    const InputRows = [MakeRow("empty", 30), MakeRow("tool", 30, { ToolTag: "tool.hammer" }), MakeRow("target", 30, { TargetTag: "target.fixture" }), MakeRow("extra", 30, { ExtraTag: "action.open" })];
    Assert.deepEqual(Evaluate(20, InputRows, { ToolTag: "tool.hammer.heavy" }).Candidates.map(Row => Row.Id), ["empty"]);
    Assert.equal(Evaluate(20, InputRows, { ToolTag: "tool.hammer", TargetTag: "target.fixture", ExtraTag: "action.open" }).Candidates.length, 4);
});

Test("자세·애셋 유효성은 높이 판정과 별도로 검사한다", function()
{
    const InputRows = [MakeRow("stand", 30, { Stance: "stand" }), MakeRow("crouch", 30, { Stance: "crouch" }), MakeRow("missing", 30, { HasAsset: false })];
    Assert.equal(Evaluate(20, InputRows, { Stance: "crouch" }).BestRows[0].Id, "crouch");
});

Test("높이를 구할 수 없으면 높이 조건만 건너뛴다", function()
{
    Assert.equal(Evaluate(150, Rows, { HeightResolvable: false }).BestRows[0].Id, "0");
});

Test("완전히 동률인 행은 무작위 선택 후보로 유지한다", function()
{
    const Result = Evaluate(20, [MakeRow("first", 30), MakeRow("second", 30)]);
    Assert.equal(ChooseMontage(Result.BestRows, () => 0).Id, "first");
    Assert.equal(ChooseMontage(Result.BestRows, () => 0.99).Id, "second");
});
