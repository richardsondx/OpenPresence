# Conversation evaluation contract

This reference defines the compact interchange format for a conversation-prompt evaluation. The model under test never receives the grader's rubric or expected outcome.

## Case shape

```json
{
  "id": "milestone-with-mixed-feelings",
  "surfaces": ["rehearsal", "presence_chat", "live_social"],
  "scenario": {
    "post": "We finally crossed $10k MRR today. Took way longer than I expected.",
    "thread": [],
    "relationship": "peer",
    "evidence": "The author describes a real milestone and mixed feelings."
  },
  "intent": "Respond naturally to the person and the moment. A short acknowledgment or a specific thought may fit; a mini-lesson would not.",
  "valid_silence": false,
  "required": true,
  "failure_modes": ["generic praise", "turning the milestone into a lesson", "forced question", "AI-sounding filler"]
}
```

`intent` is a social expectation, not a required sentence or choreography. It should remain short enough for a blind grader to apply consistently. Meaning-file stance and voice are supplied as context to the grader and inferred from the Agent files.

## Trial shape

```json
{
  "caseId": "milestone-with-mixed-feelings",
  "surface": "rehearsal",
  "variant": "A",
  "trial": 1,
  "output": "That is a hard-won milestone. The long road is part of the story.",
  "metadata": {
    "provider": "ollama",
    "model": "selected-model",
    "promptRevision": "working-tree",
    "meaningFileRevisions": {"BRAIN": 1, "TASTE": 1}
  },
  "grades": [
    {
      "graderId": "social-fit-1",
      "blind": true,
      "scores": {
        "socialFit": 3,
        "identityVoice": 3,
        "naturalness": 2,
        "judgment": 3,
        "grounding": 3,
        "constraints": 3
      },
      "requiredFailure": false,
      "uncertain": false,
      "reason": "Specific and proportionate, with no unnecessary explanation."
    }
  ]
}
```

## Interpretation

- A required case passes only when no required failure is present and its mean score is at least 2.5, with social fit and naturalness each at least 2.
- A run passes only when every required case has a passing rate of at least 80% across repeated trials and no disqualifying constraint failure appears.
- A candidate B is a regression when it lowers a required case's pass rate by more than 10 percentage points, introduces a required failure, or materially reduces identity/voice scores.
- A candidate B is an improvement only when it improves the targeted failure across repeated trials and does not regress required coverage.
- “Uncertain” is a real result. Preserve the grader disagreement and show representative outputs rather than converting uncertainty into a pass.

AI slop is evaluated behaviorally. Look for generic openings, stock significance windups (for example, “This is the part people skip” or “The interesting shift is not just…”), padded explanation, stock reassurance, forced questions, repeated choreography, consultant language, borrowed source phrasing, and a response that could belong to any AI account. These are signals, not a banned-word list; an intentional Agent voice can use a surface feature when it fits.

## Human-review report

The Markdown artifact should contain:

1. verdict and confidence;
2. A/B pass rates and required regressions;
3. the smallest set of failed or uncertain behaviors;
4. short output pairs only where comparison helps the operator judge social quality;
5. proposed prompt change, rationale, and remaining risks.

The JSON artifact should retain every case, trial, output, metadata field, grader score, disagreement, ablation result, and report decision.
