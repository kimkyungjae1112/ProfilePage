export function EvaluateMontages(Rows, Context)
{
    const Evaluations = Rows.map(function(Row)
    {
        let Reason = "candidate";

        if (Row.HasAsset === false)
        {
            Reason = "asset";
        }
        else if (Row.ToolTag && Row.ToolTag !== Context.ToolTag)
        {
            Reason = "tool";
        }
        else if (Row.TargetTag && Row.TargetTag !== Context.TargetTag)
        {
            Reason = "target";
        }
        else if (Row.ExtraTag && Row.ExtraTag !== Context.ExtraTag)
        {
            Reason = "extra";
        }
        else if (Row.Stance !== "any" && Row.Stance !== Context.Stance)
        {
            Reason = "stance";
        }
        else if (Row.IgnoreHeight === false && Context.HeightResolvable && Context.RelativeHeight > Row.Height)
        {
            Reason = "height";
        }

        return { Row, Reason };
    });
    const Candidates = Evaluations.filter(function(Evaluation)
    {
        return Evaluation.Reason === "candidate";
    }).map(function(Evaluation)
    {
        return Evaluation.Row;
    });
    let BestPriority = -Infinity;
    let BestHeight = Infinity;

    Candidates.forEach(function(Row)
    {
        let HeightRank = Row.Height;

        if (Row.IgnoreHeight)
        {
            HeightRank = Infinity;
        }

        if (Row.Priority > BestPriority || (Row.Priority === BestPriority && HeightRank < BestHeight))
        {
            BestPriority = Row.Priority;
            BestHeight = HeightRank;
        }
    });

    const BestRows = Candidates.filter(function(Row)
    {
        let HeightRank = Row.Height;

        if (Row.IgnoreHeight)
        {
            HeightRank = Infinity;
        }

        return Row.Priority === BestPriority && HeightRank === BestHeight;
    });

    return { Evaluations, Candidates, BestRows };
}

export function ChooseMontage(BestRows, Random = Math.random)
{
    if (BestRows.length === 0)
    {
        return null;
    }

    return BestRows[Math.floor(Random() * BestRows.length)];
}
