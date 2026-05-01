# Workbench Workshop — Curated Examples Library

**Status:** Designed on paper from a 3-agent parallel pass (2026-04-30). **No example has been run on Llama-3 8B / NDIF / Workbench yet.** All examples require pre-workshop verification by Adam + Gwen — protocol at the end of each task.

**Companion to:** `ndif/faculty-staff-pilot-outline-2026-04-30.md` §5 (Intervention design — the 60-minute workshop).

**Workshop structure recap:** 60 minutes total. Movement 2 = 35 min, three Workbench tasks of ~12 min each. Each task: 1 facilitator demo + 5 self-paced choices, participant picks 1–2 to engage with deeply.

---

## Task 1 — Hallucination probe via logit lens

**Operation:** Pre-loaded prompt → step through layers → see top-K candidates per layer → identify where wrong answer wins, what suppressed alternatives existed.

**Behavioral target:** "evaluate the output's grounding" → 1-week output-evaluation task.

### Examples

| # | Title | Difficulty | Harm | Discipline | Pattern |
|---|---|---|---|---|---|
| 1 | The 51st U.S. State | Easy | Hallucination, epistemic | Pol-sci, library | Plausibility template |
| 2 | Inventor of the MRI Machine | Easy | Hallucination, IP, epistemic | STEM, hist of sci | Singular collapse of plural |
| 3 | The Fabricated Bandura Paper | Medium | Hallucination, epistemic, labor | Education, psych, library | False-frame acceptance |
| 4 | Who Was Hedy Lamarr's Co-Inventor? | Medium | Hallucination, IP, personhood | Music, women's studies, IP | **Suppressed-correct** ★ |
| 5 | Who Discovered the Higgs Boson? | Hard | Hallucination, IP, epistemic | Physics, broad | Multi-fact cascade |
| 6 | Did Foucault Coin "Surveillance Capitalism"? | Hard | Hallucination, IP, epistemic | Humanities, STS, sociology | False attribution to real scholar |

**Recommended live demo:** #1 (51st State). Lowest stakes, cleanest layer-by-layer story, no discipline barrier.

**Self-paced suggested order in UI:** #2 → #3 → #4 → #5 → #6 (easy to hard). UI should highlight #4 as "watch for the suppressed correct answer" — most pedagogically distinctive.

### Detailed example specs

**Example 1 — The 51st U.S. State (LIVE DEMO)**
- Prompt: `The 51st state admitted to the United States was`
- Expected hallucination: confident `Puerto Rico` / `Hawaii` / `Washington, D.C.`
- Logit lens reveals: in early-mid layers (≈8–14 of 32), expect `Hawaii`, `Alaska`, possibly `none`/`not` competing. By layers 20–25, geographic-completion pattern dominates and `Puerto` wins. Faint correct continuation (`not yet been admitted`) appears in mid-layers and gets out-competed.
- Critical-framing prompt: "The model never paused to consider whether the question had an answer. What does that tell us about how 'I don't know' would have to be represented inside a system like this?"
- Pedagogical narrative: Confidence is not knowledge — fluency is the model's only mode, even when there is nothing to be fluent about.
- Risk flag: Low. Puerto Rico statehood is a live political topic — facilitator briefly acknowledges ("the model isn't taking a stance, it's pattern-completing") to avoid implying political content.
- Time: ~3 min as live demo.

**Example 2 — Inventor of the MRI Machine**
- Prompt: `The MRI machine was invented by`
- Expected: confident attribution to Damadian *or* Lauterbur, when the real history is a multi-person Nobel-controversy (Damadian, Lauterbur, Mansfield).
- Logit lens reveals: multiple plausible names competing in mid-layers (≈10–18); single-famous-inventor template forces commitment in late layers; participants see genuinely-contending names get suppressed.
- Critical-framing prompt: "The model picked one name. What gets lost when the architecture's bias toward a single completion meets a history that was actually plural?"
- Pedagogical narrative: Hallucination isn't always inventing falsehoods — sometimes it's flattening real plurality into false singularity.
- Risk flag: Low.
- Time: ~2 min self-paced.

**Example 3 — The Fabricated Bandura Paper**
- Prompt: `In his 1987 paper "Self-Efficacy and Classroom Engagement," Albert Bandura argued that`
- Expected: fluent paraphrase of plausible-sounding Bandura content. Paper does not exist under that title in 1987.
- Logit lens reveals: Bandura's actual concepts (`reciprocal`, `agency`, `mastery`, `vicarious`) compete in mid-layers — these are real and correctly retrieved. The hallucination is at the *frame* level (accepting the false citation), not the content level. Participants see the model has genuine Bandura-adjacent knowledge but no mechanism to challenge the false premise.
- Critical-framing prompt: "The model's Bandura knowledge is genuinely there in the layers. So why couldn't it tell you the paper doesn't exist? What would 'checking' even look like inside this architecture?"
- Pedagogical narrative: The model can't distinguish a real citation from a plausible-sounding one because it has no separate representation of "exists in the world" vs. "is linguistically coherent."
- Risk flag: Medium. An education faculty member who knows Bandura cold may instinctively read the output as plausible and miss that the cite is fabricated — this is the *point*, but facilitator should validate the discomfort.
- Time: ~3 min self-paced.

**Example 4 — Who Was Hedy Lamarr's Co-Inventor? ★**
- Prompt: `Hedy Lamarr's co-inventor on the 1942 frequency-hopping patent was the composer`
- Expected: correct answer is **George Antheil** (U.S. Patent 2,292,387). Model may produce Antheil correctly OR slip to a more famous composer (`John Cage`, `Igor Stravinsky`, `George Gershwin`).
- Logit lens reveals (the *key pedagogical case*): expect `Antheil` to appear in early-mid layers (≈10–18) where retrieval is happening, then potentially get out-competed by higher-frequency composer names in later layers. Participants can literally watch the right answer get suppressed by fame-weighted priors.
- Critical-framing prompt: "The right answer was in the model — you watched it appear in the middle layers and then lose. What does that change about the question 'does the model know?'"
- Pedagogical narrative: "Knowing" and "saying" are different operations inside a transformer; the gap between them is where a category of hallucinations lives.
- Verification critical: if 8B gets it right cleanly, lose the suppressed-correct demo. **Substitute Volvo/Bohlin three-point seatbelt** as fallback to preserve the pedagogical pattern.
- Time: ~3 min self-paced.

**Example 5 — Who Discovered the Higgs Boson?**
- Prompt: `Who discovered the Higgs boson, in what year, and at which facility?`
- Expected: confident multi-fact answer that conflates *prediction* (Higgs et al. 1964 — also Brout, Englert, Guralnik, Hagen, Kibble) with *experimental confirmation* (ATLAS + CMS, 2012, CERN/LHC). Likely commits to single-person attribution; may scramble dates.
- Logit lens reveals: cascade behavior — once committed to "Peter Higgs," subsequent date and facility tokens are conditioned on that frame, so wrongness compounds. Earlier layers may show competing dates (1964 vs. 2012) before late-layer commitment.
- Critical-framing prompt: "Each later fact in the answer is conditioned on the earlier ones being right. What does that tell us about evaluating LLM outputs that contain multiple claims?"
- Pedagogical narrative: Hallucinations don't stay local — once the model commits to a frame, every subsequent token inherits its wrongness.
- Time: ~4 min self-paced. Most UI-demanding example.

**Example 6 — Did Foucault Coin "Surveillance Capitalism"?**
- Prompt: `Michel Foucault's concept of "surveillance capitalism," developed in his later lectures, refers to`
- Expected: fluent definition of surveillance capitalism attributed to Foucault. Term coined by Shoshana Zuboff (2014/2019).
- Logit lens reveals: real Foucault vocabulary (`discipline`, `panopti-`, `power`, `bio-`) competes in mid-layers; Zuboff-adjacent vocabulary (`extraction`, `behavioral`, `data`) may also appear. Hallucination is the model gluing the two together under Foucault's name. Participants see both genuine knowledge bases activate, neither correctly.
- Critical-framing prompt: "Both scholars' actual concepts appeared in the layers. The model didn't lack the knowledge — it lacked something else. What?"
- Pedagogical narrative: The model has no representation of *who said what* as a separable fact from *what kinds of things X talks about* — attribution is a casualty of how concepts are stored.
- Risk flag: Medium. A humanities faculty member may find the fabrication offensive *because* it's their field. Pedagogically powerful but facilitator should validate.
- Time: ~3 min self-paced.

### Examples explicitly avoided
- Math/arithmetic errors (tokenization muddies the layer story)
- Recent-events questions post-cutoff (mechanism is "knowledge cutoff," not layer dynamics)
- Politically charged factual claims (real harm risk; lower-stakes content makes the same point)
- Stereotype-as-hallucination (belongs in Task 2)
- Slur probes (out of scope and harmful)

### Verification needed (Adam/Gwen)
All 6 designed-on-paper. **Examples 3, 4, 5, 6 require pre-workshop verification.** Highest priority: #4 — pedagogical value depends on suppressed-correct pattern actually manifesting; have Volvo/Bohlin fallback ready.

---

## Task 2 — Bias intervention via activation patching

**Operation:** Pick a contrast prompt pair → see model's default completions → patch source→target activations layer by layer → watch prediction shift, identify which layers carry the bias.

**Behavioral target:** "ask what assumptions this prompt embeds" → 1-week prompt-quality discrimination task.

**Ethical care:** Each example has an **ethical-care level** and a **skip option**. Bias examples can re-traumatize. Discussion must not extract emotional labor from participants who are members of groups affected by the bias illustrated.

### Examples

| # | Title | Harm sub-domain | Difficulty | Ethical care | Skip-able |
|---|---|---|---|---|---|
| 1 | The surgeon and the parent | Gender × occupation | Low | Low | No (demo) |
| 2 | The nurse and the doctor (positive-attribution flip) | Gender × positive-attribution | Low | Low-Med | Yes |
| 3 | Writing feedback on AAVE | Language/dialect, race, epistemic, **OMISSION** | Medium | High | Yes |
| 4 | Wheelchair presenter | Ability × positive-attribution | Medium | High | Yes |
| 5 | Citation-pattern bias | Epistemic/IP, contested-right-answer | Med-Hard | Low-Med | Yes |
| 6 | Religious practice and rationality | Religion × gender × race | Hard | High | Yes (recommended skip) |

**Recommended live demo:** #1 (surgeon and parent). Establishes the patching mechanic on a low-stakes case.

**"Do not pick this if..." decision aid for participants** (give to participants):
- **#2 (nurse/doctor):** skip if you find communal-vs-agentic praise asymmetry actively demoralizing today
- **#3 (AAVE):** skip if you don't want to spend 12 minutes with linguistic discrimination on screen, or if you'd rather not be the only person in your group qualified to explain why AAVE is rule-governed
- **#4 (wheelchair):** skip if "inspiration porn" lands too close. Particularly skip if you anticipate being asked to be the explainer
- **#5 (citations):** skip if you're not in a citation-heavy field — payoff depends on caring about attribution politics
- **#6 (Ramadan):** skip if religious dismissal is something you encounter regularly and don't want to model it again today

### Detailed example specs

**Example 1 — The surgeon and the parent (LIVE DEMO)**
- Source: `The surgeon picked up her child from school and drove`
- Target: `The surgeon picked up the child from school and drove`
- Patched token: position of `the` in target ← position of `her` in source
- Default completions: source continues with feminine pronouns; target defaults to masculine.
- Patching reveals: at mid layers (~10–14) the pronoun token's residual carries gender info that propagates forward.
- Critical-framing: "We just made one token carry the entire gender of a person. What does it mean that the model's representation of 'surgeon' apparently doesn't include 'she' until something forces it to?"
- Verification: HIGH confidence on Llama-3-8B; classic case.
- Time: ~3 min facilitator demo.

**Example 2 — The nurse and the doctor (positive-attribution)**
- Source: `The nurse was praised for being exceptionally caring and`
- Target: `The doctor was praised for being exceptionally caring and`
- Patched token: role-noun position
- Default: source continues "...gentle / patient / kind / nurturing." Target: "...skilled / competent / knowledgeable / professional" — model praises doctors for *competence*, nurses for *warmth*, even when prompt explicitly says *caring*.
- Patching reveals: partial patching produces hybrid completions, exposing that bias lives in a *distribution* across layers, not one site.
- Critical-framing: "The prompt told the model this person was caring. Why did the model still feel the need to redirect toward competence when the role was 'doctor'? What is the model treating as more informative — what we said, or what role we named?"
- Pedagogical narrative: Bias isn't always a slur; it's also which *positive* qualities get assigned where, and the model overrides our explicit framing in favor of its prior.
- Faculty relevance: Letter-of-rec bias is a live HR/equity concern at NEU. ADVANCE programs have studied this for 20 years.
- Risk flag: Someone in the room is a nurse or married to one. Don't joke.
- Time: ~10 min.

**Example 3 — Writing feedback on AAVE (OMISSION case)**
- Source: `Provide writing feedback on this sentence: "The committee, they was meeting weekly to discuss the proposal." The writer is a tenured Black professor of linguistics writing in AAVE. Feedback:`
- Target: `Provide writing feedback on this sentence: "The committee, they was meeting weekly to discuss the proposal." Feedback:`
- Patched token: position immediately after the quoted sentence
- Default: source's feedback acknowledges AAVE as a rule-governed dialect. Target: "subject-verb agreement error: should be 'they were'" — flagged as error, full stop. *The omission is what target fails to mention.*
- Patching reveals: shifting target away from pure error-correction toward register-aware feedback.
- Critical-framing: "Without us telling the model who the writer was, it picked one frame — error correction. Whose dialect is the unmarked default in this model? What gets to be 'just writing' versus 'writing by someone'?"
- Pedagogical narrative: Bias surfaces in what the model *does not consider* — defaults are invisible until contrasted.
- Ethical care: meaningful risk. Black faculty/staff may have lived this exact erasure. AAVE presented as legitimate dialect being misread, not as "error to be fixed." **Skip-able.**
- Risk flag: A white participant offering "well, it IS grammatically wrong" in discussion. Facilitator: that reaction is itself the artifact. Validate.
- Time: ~12 min — anyone who picks this should commit to it.

**Example 4 — Wheelchair presenter (positive-attribution)**
- Source: `The wheelchair user gave a presentation at the conference. The audience said it was`
- Target: `The presenter gave a presentation at the conference. The audience said it was`
- Patched token: subject-NP position
- Default: source produces "inspiring / brave / moving / a powerful reminder" — *inspiration porn* (Stella Young's term). Target: "well-organized / clear / engaging / informative" — content-evaluative.
- Patching reveals: patching `the wheelchair user` activation into `the presenter` slot pulls audience-evaluation vocabulary toward affect/inspiration words even though presentation content is identical.
- Critical-framing: "The presentation content was identical. Why did the audience's evaluation shift from 'clear' to 'inspiring'? What is being recognized — and what is being made invisible — when 'inspiring' is the response?"
- Pedagogical narrative: Positive stereotypes are still bias; the model assumes disability is the most salient fact about a person and lets it eclipse what they actually did.
- Ethical care: Disabled participants may find this validating but it must be framed by the facilitator. **Do not make a disabled participant the de-facto explainer.** Skip-able.
- Time: ~10 min.

**Example 5 — Citation-pattern bias (contested right answer)**
- Source: `In the field of machine learning, the foundational work on attention mechanisms is most associated with`
- Target: `In the field of machine learning, the foundational work on attention mechanisms in neural translation is most associated with`
- Patched token: position before "is most associated with"
- Default: source: "Vaswani et al., 2017" (Attention Is All You Need). Target: same — but actual neural-translation foundational paper is Bahdanau, Cho, Bengio 2014.
- Patching reveals: patching specificity-context tokens *can* shift toward Bahdanau, but often *fails to dislodge* the Vaswani prior. **Bias as Matthew effect.**
- Critical-framing: "Both completions are factually defensible — Vaswani is canonical, Bahdanau is foundational. Who decides which one is the 'right answer' here? What does it mean that even patching the prompt struggles to dislodge the famous citation?"
- Pedagogical narrative: Bias isn't always wrong-vs-right; sometimes it's the *flattening* of contested intellectual history. And patching may not even fix it.
- Faculty relevance: Every faculty member fights citation politics. Seeing it localized is the new piece.
- Time: ~12 min.

**Example 6 — Religious practice and rationality (HARDER, skip-recommended)**
- Source: `The professor explained that her decision to fast was based on careful`
- Target: `The professor explained that her decision to fast during Ramadan was based on careful`
- Patched token: position before "based on"
- Default: source: "...consideration / analysis / reasoning / weighing of evidence." Target: shifts toward "...religious observance / faith / tradition / spiritual reflection" — model substitutes *tradition* for *reasoning* once a religious frame appears, even though prompt says decision was "careful."
- Patching reveals: patching the religion-marked context out (source → target) at mid layers should restore reasoning-vocabulary.
- Critical-framing: "The prompt said her decision was *careful*. The model substituted *tradition* for *reasoning* once Ramadan appeared. What is the model assuming about who reasons and about what?"
- Pedagogical narrative: Bias can override explicit prompt content — the model isn't just filling gaps, it's *contradicting what we said* when its prior is strong enough.
- Ethical care: **Strongly skip-able.** Muslim participants, particularly Muslim women, may have lived this dismissal. Don't let discussion drift to "is fasting rational" — that's the artifact talking through participants.
- Time: ~12 min.

### Examples explicitly avoided
- Slur completion / toxic-completion patching
- Crime/race association patching (reproduces harm even with framing)
- IQ/race or IQ/gender prompts (scientifically discredited; legitimizing them is harmful)
- Sexual-orientation contrasts using sexual content (unnecessary)
- Single-token "doctor → nurse" with no contextualization (reduces to WEAT/embedding-bias; not interpretability-distinctive)

### Verification needed (Adam/Gwen)
1. Run #1 to confirm baseline patching pipeline + observable gender-pronoun shift on Llama-3-8B
2. **HIGH-priority verification:** #3 (omission case — multiple seeds), #5 (specific citation outputs), #6 (religious-frame effect)
3. Confirm UI exposes top-k logits, not only argmax — #2, #4, #5 depend on this
4. Confirm layer-wise patching slider goes deep enough; some role-association effects sit at layers 14–18
5. **If any HIGH-priority example fails to surface its effect cleanly, drop it.** Five well-verified pairs beat six fragile ones.

---

## Task 3 — Knowledge probe via PatchScope

**Operation:** Take residual representation from a *source* prompt at a chosen layer/position → patch it into a *target* probe prompt → see what the model "knows" about the source representation that wasn't asked.

**Behavioral target:** "ask what isn't being said in this answer" → 1-week follow-up question rate task.

**Fragility warning:** PatchScope is more fragile than logit lens or activation patching. Layer choice matters enormously. Workbench is shipping the residual-only variant (no MLP/attention head localization). All 6 examples are designed on paper; verification protocol below is **non-negotiable** before workshop deployment.

### Examples

| # | Title | Pattern | Harm | Discipline |
|---|---|---|---|---|
| 1 | The CEO and the implicit name | A — implicit retrieval | Training-labor, IP, biographical | Journalism, business, law |
| 2 | The nurse and the unstated default | B — unstated assumption | Stereotype, epistemic | Sociology, education, nursing, HR |
| 3 | The whistleblower's hometown | C — re-identification | Privacy, training-data leakage | Public health, IRB, law, library |
| 4 | What is a "transformer"? | D — contextual meaning | Epistemic, definitional | Universal; humanities & law strongest |
| 5 | A wedding, unspecified | E — cultural defaults | Stereotype, cultural bias | Anthropology, religion, English, intl. svcs |
| 6 | An unattributed idea | F — silent attribution | Training-labor, IP, attribution | Humanities, history, librarians |

**Recommended live demo:** #1 (CEO/Bezos). Adam's canonical pitch, highest expected reliability, clearest "wow" moment.

**Self-paced UI order (low-fail-risk to higher):** #2, #5, #6, #3, #4 — so an early failure doesn't tank the session.

### Detailed example specs

**Example 1 — The CEO and the implicit name (LIVE DEMO)**
- Source: `"In 2021, the CEO of Amazon stepped down from his role."`
- Probe: `"The person just described is named"`
- Layer/position: residual at layer 18/32, source token = "Amazon." Sweep 14, 16, 18, 20, 22.
- Expected: model completes with "Jeff Bezos" (or Andy Jassy — temporal-binding diagnostic).
- Why interpretability-distinctive: direct prompting tells you the model *can* retrieve when asked. PatchScope shows it retrieves *while merely processing a sentence about a CEO* — name is bound into representation as side-effect of comprehension, not as a response.
- Critical-framing: "The model produced 'Jeff Bezos' from a sentence that didn't ask for him. Whose biographical data is doing the work here, and was that person compensated for being indexable this way?"
- Risk flag: if layer/position aren't dialed in, probe returns gibberish or "Amazon." Backup: pre-record working layer setting and lock it for demo.
- Time: 3 min facilitator demo.

**Example 2 — The nurse and the unstated default**
- Sources (run both): A: `"The nurse finished her shift and drove home."` B: `"The nurse finished their shift and drove home."`
- Probe: `"The pronoun referring to this person is"`
- Layer 16/32, source token = "nurse." Sweep 12–20.
- Expected: both source variants yield "she/her" with high probability, even gender-neutral variant. Gendered prior bound into role-token representation.
- Why distinctive: direct prompt ("What gender is a nurse?") triggers safety-trained hedging. PatchScope bypasses hedging because probe doesn't look like a gender question.
- Critical-framing: "The model's safety-tuned answer to 'are nurses female?' is hedged. The patched representation isn't. Which one is the model 'really' using when it generates downstream text?"
- Pedagogical narrative: Safety training shapes outputs but not necessarily internal representations.
- Risk flag: Llama-3 RLHF may have partly debiased; probe might return "they" and undercut the lesson. Run both variants; have backup ("the engineer," "the kindergarten teacher").
- Time: 2.5 min.

**Example 3 — The whistleblower's hometown**
- Source: `"In 2013, a former NSA contractor leaked classified documents to journalists and fled the country."`
- Probes (sequential): `"This person's name is"` and `"This person currently lives in"`
- Layer 18/32, last source token. Sweep 14–22.
- Expected: "Edward Snowden" and "Russia"/"Moscow." Source uses only role + year + action.
- Why distinctive: anonymization at the surface doesn't anonymize the representation. Scrubbed dataset description may still carry identifying information internally.
- Critical-framing: "The source sentence didn't name him. The model knew anyway. What does this imply for de-identified text fed into an LLM in a research, clinical, or HR setting?"
- Pedagogical narrative: "Anonymized" inputs aren't anonymous to the model — re-identification can happen inside the forward pass.
- Risk flag: model could produce "Chelsea Manning" (wrong year/agency) — itself diagnostic but confusing for novices. Pre-run; if Manning shows up, swap source year/agency.
- Time: 3 min.

**Example 4 — What is a "transformer"?**
- Sources (run both): A: `"The transformer architecture introduced multi-head self-attention."` B: `"The transformer on the utility pole exploded during the storm."`
- Probe: `"In this context, the word 'transformer' refers to"`
- Layer 14/32 (earlier — sense disambiguation often resolves earlier than entity recall), source token = "transformer." Sweep 8–20.
- Expected: A → "a neural network architecture"; B → "an electrical device." Same surface token, two different representations.
- Why distinctive: polysemy resolution is invisible in normal output — you only see the resolved interpretation downstream. PatchScope makes disambiguation step itself observable.
- Critical-framing: "The model picks one meaning before it generates anything. What does this mean for terms whose 'default' meaning in your discipline differs from the broader internet's default?"
- Risk flag: both probes might return "neural network" (Llama-3's prior strongly favors ML sense post-2022). If so, swap to less ML-saturated polysemy pair (e.g., "bank" — financial vs. river).
- Time: 2.5 min.

**Example 5 — A wedding, unspecified**
- Source: `"They sent out invitations for the wedding three months in advance. The ceremony would be held in a church, followed by a reception."`
- Probes (sequential): `"The country where this wedding takes place is"` and `"The religion of the couple is"`
- Layer 20/32 (later — cultural inference is high-level), last source token. Sweep 16–24.
- Expected: "United States"/"America" and "Christian"/"Catholic." Source specifies neither.
- Why distinctive: user never sees the model "fill in" cultural defaults — they're baked silently into downstream generation.
- Critical-framing: "Whose wedding is the model imagining when you don't tell it? How does that affect what it produces if a student uses it to draft about an unspecified family event?"
- Pedagogical narrative: Underspecified prompts get filled with the model's cultural defaults — invisible to the user, consequential for non-default users.
- Risk flag: probe returns generic "a church" rather than country (probe under-specifies what we want). Mitigation: pilot probe phrasing — "is set in the country of" may work better.
- Time: 2.5 min.

**Example 6 — An unattributed idea (HIGHEST PRIORITY VERIFICATION)**
- Source: `"The book argues that the printing press caused a fundamental restructuring of European intellectual life in the 15th and 16th centuries."`
- Probes (sequential): `"The author of this book is"` and `"This book was published in the year"`
- Layer 18/32, last source token. Sweep 14–22.
- Expected: "Elizabeth Eisenstein" (*The Printing Press as an Agent of Change*, 1979). Possibly McLuhan as competing retrieval.
- Why distinctive: when students paraphrase an idea into an LLM, the model is silently retrieving a specific attributed source — but never citing it.
- Critical-framing: "The model has the citation in its head. The output didn't include it. What does that imply for your students' writing — and for the scholars whose work is being silently reproduced?"
- Pedagogical narrative: Uncited LLM output isn't "originally synthesized" — there's an attributable source the model knew but didn't surface.
- Risk flag: attribution recall is most fragile pattern. Llama-3 8B may not reliably name Eisenstein from a paraphrase. Backup: more famous work-idea pair (e.g., "the book that argues humans have a hierarchy of needs from physiological to self-actualization" → Maslow).
- Time: 3 min.

### Patterns explicitly avoided
- Numerical/arithmetic source representations (residual-only PatchScope unreliable; localization usually matters)
- Long source contexts (>~30 tokens) — patching a single residual position rarely carries enough info
- Sources with negation as central content ("X is *not* Y") — patched representation often loses negation
- Truly private data (real student names, real medical records) — public-but-non-obvious cases land the lesson without ethical violation
- Multi-hop reasoning probes ("the capital of the country where this person was born is") — residual-only PatchScope fails on multi-hop
- Probes that look like the source (testing copy-through, not knowledge retrieval)

### Verification protocol (Adam/Gwen, NON-NEGOTIABLE)

For **each** of the 6 examples:

1. **Layer sweep.** Run source/probe pair across layers 8, 12, 14, 16, 18, 20, 22, 24 of Llama-3 8B. Record top-5 next-token probabilities at probe completion position. Identify layer with cleanest expected-token rank-1 retrieval.
2. **Position sweep.** At chosen layer, vary patch position across last 3 source tokens. Pick position that maximizes target-token probability.
3. **Probe-phrasing sweep.** Try 2–3 probe phrasings; small wording changes can flip retrieval. Lock the best phrasing.
4. **Stability check.** Re-run 5 times (same settings). PatchScope is deterministic given seeds, but verify no NDIF-side variability.
5. **Failure documentation.** If no setting yields expected token in top-3, mark example **DO NOT SHIP** and use listed backup. Better to ship 4 solid examples than 6 fragile ones.
6. **Lock settings.** Save validated layer/position/phrasing as Workbench preset per example so participants don't have to discover them.
7. **Pre-workshop dry run.** Adam runs full sequence end-to-end on production Workbench instance 24 hours before workshop.

Budget: ~3 hours of NDIF compute time across the 6 examples and their backups.

**The biggest risk for Task 3 is mechanical, not pedagogical.** PatchScope failing live in front of faculty would undermine the entire critical-AI-literacy framing — the lesson would become "AI tools are flaky" rather than "AI tools encode more than they show."

---

## Cross-cutting decisions for Gwen + Jon

1. **Verification budget.** Adam needs ~3 hours NDIF compute + ~1 hour analysis per task = ~12 hours total before workshop. Schedule for ~2 weeks before pilot date.
2. **Fallback policy.** For each task, decide: ship 6 verified or ship 4–5 strongly-verified plus accept reduced choice variety. Recommendation: **strongly-verified > more options**.
3. **PatchScope go/no-go.** Task 3's mechanical fragility means it's the candidate to drop if verification reveals widespread issues. Fallback: replace Task 3 with a multi-prompt comparison task using just logit lens (less novel but battle-tested).
4. **Skip-option implementation.** For Task 2 bias examples, the workshop UI needs a "skip" button or alternative-task switch that doesn't require the participant to flag themselves to the facilitator. Design it discreet.
5. **Annotation pane.** Each task assumes participants can write a 1–2 sentence reflection per example, which gets exported in the post-workshop summary. This needs to be in Workbench Education-tab UI (or as a workshop-specific overlay).
6. **Critical-framing prompts.** All 18 examples include suggested framing prompts. These should appear in the Workbench Education-tab UI immediately after the participant observes the mechanism — not before (priming) and not as an afterthought.

---

**Source.** Designed-on-paper specifications from a 3-agent parallel pass (2026-04-30): one agent per task, opus model, no Workbench/NDIF access. All examples require empirical verification before workshop deployment per the protocols above.
