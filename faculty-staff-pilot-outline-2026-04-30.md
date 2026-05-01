# Workbench AI Literacy — Faculty/Staff Pilot Project Outline

**Status:** Working draft for Gwen + Jon. Built from a 6-agent literature deep-read (2026-04-30) plus a 3-agent verification pass (same day) after the 6 missing fulltext PDFs were attached. All quoted citations are direct from fulltexts. Two narrow gaps remain at supplementary-material level (Hornberger online appendix for verbatim MC item wording; SNAIL Supplementary Material 1 for V##→Delphi# crosswalk) — flagged in §13 and required before pre-registration.

**Replaces:** Previous "university-wide via provost" framing. Faculty/staff workshop is now scoped as **Phase 1**, with provost-channel university-wide rollout as a planned Phase 2 conditional on Phase 1 outcomes.

---

## 1. Executive summary

We will run a 60-minute Workbench-led AI literacy workshop with NEU faculty and staff in summer 2026, evaluated as a **3-arm randomized controlled pilot** with pre/post + 1-week behavioral follow-up. The intervention pairs interactive mechanistic interpretability (Workbench: logit lens, activation patching) with a *critical* AI literacy framing — refusing the instrumentalist tool-training mode that dominates current faculty PD (Conrad & Kamperman 2025, p. 144) — and pitches in DEC's "AI-Resilient as a baseline design principle" vocabulary (DEC 2025, p. 10) for institutional alignment.

The pilot's primary contribution is empirical: no prior tool-mediated AI literacy study has paired interpretability-grade tooling with adult professional populations, used a 3-arm Zhao-style control, *and* triangulated self-report + objective + behavioral measures. The KU Institute (Conrad & Kamperman 2025) was a 5-day residential institute with no rigorous evaluation; Bhat & Long (2024) used CV primitives at DIS scale; Transformer Explainer (Cho et al.) explained architecture, not interpretability; Bashardoust et al. (2024) trained journalists on prompt engineering with N=29 and no behavioral measures.

**Phase 1 success criteria:** (a) measurable Workbench-arm gain on Hornberger objective knowledge ≥ d=0.4 over active control; (b) Workbench-arm 1-week behavioral follow-up shows underspecified-prompt rejection ≥ 60% (Clerc 2026 benchmark: 51.5% trained vs 66.7% acceptance in controls); (c) calibration improvement (self-rated knowledge gap to objective shrinks); (d) workshop deemed worth scaling by ≥ 70% of attendees and ≥ 3 NEU institutional partners (CATLR, library, IT, provost office).

**Phase 2** — university-wide rollout via provost partnership — is conditional on Phase 1 evidence and on partnership commitments.

---

## 2. Research questions

**RQ1 (efficacy).** Does a 60-minute Workbench-led workshop produce measurable gains on validated AI literacy instruments (MAILS, SNAIL Critical Appraisal, Hornberger) for NEU faculty and staff, relative to two control conditions?

**RQ2 (mechanism).** Is *interactive mechanistic interpretability* (Workbench arm) more effective than equivalent *non-interpretability content* (architecture-level walkthrough — the "Transformer Explainer" arm) at producing critical AI literacy gains? This isolates the Workbench novelty claim from generic interactivity.

**RQ3 (behavioral transfer).** Does Workshop participation shift behavioral over-reliance and query-reformulation behavior at 1-week follow-up, using a Clerc-adapted task battery? We pre-register that calibration rises (gap between self-rated and objective knowledge shrinks) and "perceived helpfulness" of GenAI may *fall* — Bashardoust et al.'s journalist study found "Our training improved the perceived expertise of journalists but also decreased the perceived helpfulness of LLM use" (2024, p. 1), interpreted as calibration not failure.

**RQ4 (audience stratification).** Do gains differ by role (faculty / staff / library / IT), discipline (STEM / SSH / professional), and prior AI exposure? Conrad & Kamperman explicitly used cross-role mixing; we replicate.

**RQ5 (Phase-2 scoping).** What recruitment, scheduling, and incentive parameters make a faculty/staff intervention scalable to provost-channel university-wide deployment?

---

## 3. Theoretical framing

### 3.1 Critical AI literacy is non-negotiable

Conrad & Kamperman (2025) draw the load-bearing distinction:

> "Whereas the term AI literacy often entails a decontextualized, instrumentalist approach to teaching and learning about AI, critical AI literacy emphasizes the ways in which AI technologies are situated in larger systems of power." (p. 144)

They specifically reject the workshop format that dominates higher-ed PD: programs that "purport[] to teach participants how to use generative AI tools with barely a side helping of critical reflection" (p. 143), where "ethics" reduces to "ethical use" — "shorthand for questions about when to use AI and when and how to disclose that use—rather than on the ethical issues raised by the development, training, and deployment of the technology" (p. 143). The required harm scope is non-negotiable:

> "the reproduction of cultural, ethnic, and social stereotypes … the generation and circulation of inaccurate information, often referred to as 'hallucinations' … intellectual property infringement … bias in AI detection software … exploitation of labor … and harmful environmental impacts." (p. 145)

Their constructive proposal is to add "productive friction back into the experience" rather than reduce it (p. 145).

Rapanta et al. (2025) push the axis further with anti-universalism:

> "Critical GenAI literacy cannot be reduced to a universal framework; rather, it must be understood as a constellation of situated literacies, shaped by disciplinary perspectives, socio-political and cultural contexts, and technological affordances." (p. 1301)

> "A critical postdigital perspective of GenAI literacy can lead the way against technological determinism and instrumentalism." (p. 1300)

Existing AI-literacy frameworks, they argue, "frame[] AI predominantly as a tool to be used, learned, and ethically managed" (pp. 1305-1306) — and "fail to fully address the iterative, generative nature of GenAI interactions, and the transformative skills needed for liberating and critical engagement" (p. 1307).

### 3.2 DEC vocabulary alignment

The Digital Education Council *Next Era of Assessment* (2025), licensed for NEU's exclusive use, gives the provost-side conversation its operative nouns:

- **Three Assessment Types.** "AI-Free Assessment … intentionally designed to be completed without AI assistance"; "AI-Assisted Assessment … Students may use AI for limited, specific tasks under clear boundaries"; "AI-Integrated Assessment … Purposefully embed AI tools as part of the learning and assessment experience" (p. 9).
- **AI-Resilience.** "An AI-resilient design ensures that core learning outcomes cannot be easily outsourced to AI—not by relying on students to comply— but by thoughtfully creating conditions and structures that make it hard for students to use AI to complete the core learning tasks. Achieving AI-resilience requires … structural redesign of assessments" (p. 10).
- **Dual-Priority Approach.** "Priority 1: Assuring Human Competency … foundational knowledge, critical thinking, discipline expertise, and unaided skills. Priority 2: Developing Human-AI Collaboration Skills" (p. 11).
- **Five-Stage Assessment Cycle.** Set Learning Outcomes → Plan Curriculum → Develop Assessments → Assessment Delivery → Feedback and Review (p. 5).

### 3.3 Reconciliation

The two framings agree on **structural redesign over compliance** and on **process over output**: DEC's "shift from output-focused tasks to those that assess process and reasoning" (p. 7) maps cleanly to Conrad & Kamperman's "productive friction" (p. 145). They conflict on **techno-determinism**: DEC writes "As AI becomes an expectation in the workforce, assessments should include AI-related competencies" (p. 6) — exactly the inevitability premise critical AI literacy refuses (Conrad & Kamperman 2025, p. 143; Rapanta et al. 2025, p. 1300).

**Pilot stance:** endorse DEC's *AI-Resilience* and *Priority 1* (unaided human competency) — both are about protecting human capacities and require no commitment to AI inevitability — but explicitly position the workshop as helping faculty develop the literacies needed to *decide whether, when, and how* AI fits, including the option of refusal. Do not pitch as helping faculty *adopt* AI-Integrated assessment.

---

## 4. Why faculty/staff first — three reasons grounded in evidence

### 4.1 Educators are the upstream bottleneck for student AI literacy

Conrad & Kamperman frame their entire program around faculty dependency:

> "In order to help students toward these goals, teachers themselves must have the opportunity and support to fully understand the range of ethical and use issues with generative AI." (2025, p. 142)

> "many American schools cannot offer the training and resources teachers need fully to learn about and explore this emerging technology." (2025, p. 142)

> "in the absence of institutional support, educators are at risk of finding that the only available professional development around generative AI is skewed toward AI adoption by the very companies who stand to gain most from it." (2025, p. 146)

A faculty/staff-first pilot directly addresses this dependency before NEU students can be reached at scale.

### 4.2 Adult professionals are an under-studied AI-literacy population

Bashardoust et al. (2024) explicitly frame their journalist study as filling this gap:

> "empirical evidence is missing on how prompt engineering training can affect task-specific output quality, particularly in professional environments." (2024, p. 3)

> "to the best of our knowledge, there is no work that analyzes the effect of training users in prompt engineering on user experience as well as output quality." (2024, p. 4)

K-12 and undergrad samples dominate the published intervention literature (Su et al. 2025); faculty/staff sit in the same under-studied "knowledge worker" cell as Bashardoust's journalist sample.

### 4.3 NEU faculty/staff are institutionally accessible, IRB-tractable, and stratifiable

Bashardoust ran without monetary incentives because participants "were non-incentivized but motivated due to the demand in their job to learn about prompt engineering" (2024, p. 8). NEU's analogous pull groups (CATLR Fellows, library, IT, departmental faculty) provide the same intrinsic motivation while letting us collect rich stratification covariates (role, discipline, prior PD, AI use frequency) that a student sample obscures.

---

## 5. Intervention design — the 60-minute workshop

The workshop has three movements, mirroring KU's "complete the assignment as a student" critical-making mode (Conrad & Kamperman 2025, pp. 149-150) compressed to fit:

**Movement 1 (10 min) — Surface the course/work the AI is supposed to support.**
Faculty and staff name one course or work artifact they're considering AI for. Brief structured reflection: what is this artifact *for*, and what does it cost — to students, to the discipline, to people whose labor and energy GenAI is built on — if AI shows up here or doesn't?

**Movement 2 (35 min) — Workbench-led mechanistic exploration with critical scaffold.**
Three Workbench tasks, each anchored to a harm domain from Conrad & Kamperman's required scope (p. 145):

1. **Logit lens demonstration on a hallucination case** (~10 min). Surface how the model produced a fabricated citation. Direct connection to "the generation and circulation of inaccurate information, often referred to as 'hallucinations'" (Conrad & Kamperman 2025, p. 145).

2. **Activation patching on a stereotype case** (~12 min). Surface where in the model representational decisions reflecting "the reproduction of cultural, ethnic, and social stereotypes" (p. 145) are encoded.

3. **A guided self-paced exploration** (~13 min) where participants choose one of: training-data attribution / energy + compute / IP — and use Workbench scaffolds to build a defensible position on it.

The workshop does NOT teach Workbench-as-tool. It uses Workbench as a vehicle for the harm-grounded conceptual work. This is the "interpretability is the right vehicle for AI literacy" claim.

**Movement 3 (15 min) — DEC decision artifact.**
Participants complete a one-page decision worksheet that maps their original course/artifact (from Movement 1) onto DEC's typology — AI-Free / AI-Assisted / AI-Integrated / *something the framework doesn't name yet* — with reasons grounded in what they just saw in Workbench. The worksheet is the workshop's tangible output.

Scaffolding decisions (Conrad & Kamperman 2025, p. 154):
- Sustained PD argues a single afternoon is "hardly sufficient" (p. 147). We accept this and position the workshop as Phase 1, with proposed follow-on (cohort, summer institute) for the provost ask.
- "It's mainly the hallway and 'water cooler' conversations, not the lectures, that explain the efficacy of their teacher institute model" (p. 148). We protect 15 min of structured peer dialogue inside the 60.
- "A few participants would indicate the desire for more processing time in their exit surveys" (p. 149). Acknowledge this in the protocol; offer a 1-week async follow-up channel.

---

## 6. Study design

### 6.1 Three-arm RCT (Zhao 2024 design)

> "Participants were randomly assigned to one of three conditions designed to assess the impact of interactivity on AI literacy: (1) Explorable (interactive tutorial)… (2) Static (PDF tutorial)… and (3) Basic Control (no tutorial), where participants received no instructional material and proceeded directly from the pre-test to the post-test, serving as a baseline." — Zhao et al. 2024, §3 Method

We adopt the structure but replace "Static PDF" with an **active interactive control** to isolate *interpretability* (not just *interactivity*) — pre-empting the reviewer pushback "is it just interactivity that matters?":

- **Arm A — Workbench (interactive interpretability):** the 60-minute workshop above.
- **Arm B — Active matched-duration control (architecture walkthrough):** 60-minute self-paced Transformer Explainer session (Cho et al. 2026, CHI 2026 full paper, n=90). Cho et al. ran a between-subjects Prolific study in which participants "studied their assigned resource freely for up to 45 minutes" (§8.3) and showed Transformer Explainer participants "answered statistically significantly more quiz questions correctly (73.3% correct on average across 7 questions) than those in Blog (p = 0.021) and Video (p = 0.021)" (§9.1.1) — a validated dose of architecture-level conceptual gain at adult-non-expert recruitment. We adopt their 45-min self-paced exposure window plus the same critical-framing scaffold and DEC decision worksheet used in Arm A, holding total contact time at 60 min. This is the load-bearing comparator for the novelty claim: architecture-level interactive learning is the *strongest* non-interpretability comparator, not a strawman, because Cho et al. already demonstrated significant gains over both blog and video on the system's six learning objectives — including objectives ("LO6: Final probabilities and sampling parameters," "LO4: Multi-head Self-Attention mechanism," Cho Table 1) that are mechanism-adjacent. The hypothesis Workbench tests is whether *interpretability-grade* engagement adds critical-literacy gains beyond what this architecture-level ceiling delivers. Cho's six learning objectives and 7-item LO-aligned MC quiz (Cho Table 1) are reused as a manipulation check to confirm Arm B participants achieve comparable architectural gains to Cho's published 73.3%.
- **Arm C — Passive baseline:** pre/post with no intervention (waitlist control, offered the workshop after data collection).

Cao et al. (2025) used a matched-duration unrelated-content active control: "For the control group, we provided three videos, each approximately five minutes long (13.5 minutes total), about the same duration as the intervention (14 minutes total). These videos covered the development of AI before the 20th century and highlighted the scientists who made significant contributions to the field. The content was chosen to maintain relevance to AI while minimizing any impact on participants' knowledge of current AI technologies as well as the treatment content focusing on the understanding, use, and evaluation of AI" (Cao et al. 2025, p. 3). Allocation was 1:2 (control n=34 / treatment n=60, total n=94, online via Qualtrics + CloudResearch panel, ages 30-49). Note: Cao did not report independent rater validation of cross-arm content match — duration- and topic-matching was author-judgment. Workbench's Active Control arm should improve on this by pre-registering an independent-rater content-overlap audit.

### 6.2 Stratified randomization

Simple randomization (Zhao's choice, n=600 Prolific) leaves imbalance at our smaller n. Stratify by:

1. **Role** (tenure-track faculty / NTT faculty / staff / librarian / IT / postdoc)
2. **Prior generative-AI use frequency** (binary: ≥ weekly use / less than weekly)
3. **College / unit** (Khoury / non-Khoury)

Permuted-block randomize within strata. Minimization is overkill at this scale.

### 6.3 Sample size

Drawing from Zhao et al. 2024 (β = -0.14 for Basic vs Explorable on transfer items, p=.001, n≈150/arm), Cao 2025 active-control comparators, Clerc 2026 behavioral effect sizes (d ≈ 0.6 on follow-up rate), and Puppart & Aru 2025 null result on binary over-reliance:

| Outcome | Expected d | n/arm at 80% power, α=.05 |
|---|---|---|
| Self-report MAILS Δ | 0.5 | 64 |
| Hornberger objective Δ | 0.4 | 100 |
| Behavioral composite (Clerc-derived) | 0.4 | 100 |
| Behavioral binary over-reliance (Puppart-style) | 0.2 | 393 → demote to exploratory |

**Target: n = 100/arm × 3 arms = 300 enrollments.** Following KU's 33→27→23 funnel (Conrad & Kamperman 2025, p. 148) and Bashardoust's 37→29 funnel (2024, p. 8), expect ~25-30% attrition between sign-up and complete-instruments. **Over-recruit to 360.**

If recruitment caps at ~150-180 (single summer cohort), drop to 2-arm (Workbench vs Active control), n=80-90/arm. Powers MAILS and Hornberger; under-powers behavioral outcomes (acknowledge in pre-registration).

---

## 7. Measures

### 7.1 Self-report battery — MAILS subscales + SNAIL Critical Appraisal

Pre and post (~10-12 min each), drawing on Carolus et al.'s (2023) modular MAILS structure:

> "a modular measurement instrument is understood to be an instrument that consists of various components that can be used separately from one another." — Carolus et al. 2023, p. 1, §1

**Retained MAILS subscales** (from the published 34-item battery, Carolus et al. 2023, Appendix A):

| Subscale | Items | α | Sample item (verbatim) |
|---|---|---|---|
| Use & Apply AI | 6 | .93 | "I can use AI applications to make my everyday life easier." |
| Understand AI | 6 | .87 | "I can assess what the limitations and opportunities of using an AI are." |
| Detect AI | 3 | .77 | "I can tell if I am dealing with an application based on artificial intelligence." |
| AI Ethics | 3 | .75 | "I can analyze AI-based applications for their ethical implications." |
| AI Self-Efficacy: Learning | 3 | .84 | "Despite the rapid changes in the field of artificial intelligence, I can always keep up to date." |
| AI Self-Efficacy: Problem Solving | 3 | .84 | "I can handle most problems in dealing with artificial intelligence well on my own." |

**Drop:** Create AI (loads on a separate factor; "Create AI did not load on AI literacy and was only correlated to it with a r = 0.5 … Create AI should be operationalized as a separate skill that is related to, but not an inherent part of, AI literacy" — Carolus et al. 2023, p. 7); Persuasion Literacy (α=.66, lowest reliability, tangential); Emotion Regulation (tangential).

**Add SNAIL Critical Appraisal subscale.** SNAIL is a 31-item three-factor scale (Laupichler, Aster, Haverkamp & Raupach 2023, *CHB Reports* 12:100338, p. 1): "the final SNAIL-questionnaire consists of 31 items … the individual factors reflected AI competencies in the areas of 'Technical Understanding', 'Critical Appraisal', and 'Practical Application'" (abstract). Per-factor item retention after EFA (n=415, Prolific, 50/50 gender, age M=39.5): F1 Technical Understanding = 14 items, **F2 Critical Appraisal = 10 items**, F3 Practical Application = 7 items (derived from Table 2; the table shows 12 items listed under F2 with two — V03 and V09 — marked as eliminated for cross-loading). Internal consistency on the reduced 31-item set: F1 α=0.93 [CI 0.92, 0.94]; **F2 (Critical Appraisal) α=0.91 [CI 0.89, 0.93]**; F3 α=0.85 [CI 0.81, 0.88] (p. 6, §3.5). All items use uniform "I can…" framing on a 7-point Likert scale (Laupichler 2023 dev, p. 3, §2.1). Salient-loading threshold was 0.32 (Comrey & Lee 1992); per-item loadings are in the paper's Supplementary Material 1, not in the main PDF. The Critical Appraisal factor "deal[s] with the recognition of the importance of data privacy and data security in AI, ethical issues related to AI, and risks or weaknesses that may appear when applying AI technologies" (p. 5, §3.4). Content validity is established via the prior Delphi study (Laupichler, Aster & Raupach 2023, *C&E:AI* 4:100126): 53 SMEs across three iterative rounds rated 47 candidate items on a 10-point Likert relevance scale; 38 were judged relevant for inclusion (p. 5, §3.2). Three items reached early consensus (Round 1, median=10) and are anchor exemplars for the Critical Appraisal content domain: "I can describe risks that may arise when using artificial intelligence systems."; "I can explain why data plays an important role in the development and application of artificial intelligence."; and "I can identify ethical issues surrounding artificial intelligence." (Delphi p. 5, §3.2). Additional Critical-Appraisal-aligned items confirmed in the Delphi item set (Table 2): "I can describe how biases arise in AI systems."; "I can critically reflect on the potential impact of artificial intelligence on individuals and society."; "I can describe potential legal problems that may arise when using artificial intelligence."; "I can explain what the term 'black box' means in relation to artificial intelligence systems."; "I can critically evaluate the implications of artificial intelligence applications in at least one subject area."; and the combined data-privacy/security item (Delphi item #43, presented as a paired statement). SNAIL's value here is to triangulate self-efficacy gains with a content-validated critical-appraisal measure that's harder to inflate via demand characteristics. **Open verification gap:** the 10-to-Delphi-item-number crosswalk (V## → Delphi item) is in Supplementary Material 1 of the dev paper; we will pull it before pre-registration to confirm exact verbatim wording for all 10 retained F2 items. Pre/post administration uses the full 10-item F2 subscale (~3 min), 7-point Likert "strongly disagree"–"strongly agree".

**Drop SNAIL Practical Application** (redundant with MAILS Use & Apply AI).

**Order:** Demographics + AI-use frequency → MAILS (subscales grouped, items randomized within) → attention check → SNAIL Critical Appraisal → GAAIS (5+5).

**11-point self-efficacy scale** (Carolus et al. 2023, p. 6, §3.2.1): "0 = ability hardly or not at all pronounced; 10 = very well or almost perfectly pronounced." Justified because "it can easily be understood as the certainty of being able to show a behavior Bandura et al. (2006)."

### 7.2 Objective knowledge — Hornberger 2023 short form

Hornberger, Bewersdorff & Nerdel (2023, *C&E:AI* 5:100165) developed and validated an objective AI-literacy test consisting of **30 multiple-choice items + 1 sorting item = 31 items total**, calibrated under a **3-PL IRT model** on **N = 1286 German university students** (M age 23.62; 58.32% male, 38.65% female; predominantly TUM and other technical-southern-German universities, p. 3, §2.2). One item (Item 07 "Similarities of humans and AI") was eliminated post-hoc for poor discrimination (a = 0.093), leaving **30 items** in the final calibrated set (p. 5, §3.5).

The paper does **not** use a four-domain framework labeled "Technology / Application & Use / Evaluation / Ethics & Society" — that label was an outline-level shorthand and is corrected here. Items are mapped to **Long & Magerko's (2020) 16 AI literacy competencies** (Table 1, p. 3); a coarse-grained roll-up gives roughly: *Recognizing AI / Understanding intelligence* (items 1–7), *AI characteristics* (8–11), *Knowledge representation & decision-making* (12–16), *ML steps* (17–19), *Human role / programmability* (20–22), *Data literacy* (23–26), *Ethics & society* (27–31). Validation evidence: confirmatory unidimensionality (Х²/df = 2.54, RMSEA = 0.035, SRMR = 0.039, p. 5, §3.2); local independence held (all Q3 residual correlations < 0.2, §3.4); **Cronbach's α = 0.82** (p. 5, §3.6); **EAP person-separation reliability r = 0.85** (p. 5, §3.6). Item difficulty (corrected for guessing) ranged from 0.098 to 0.818 (p. 4, §3.1).

**Item-level IRT difficulties (3-PL, in logits, Table 5, p. 8):**

| # | Short label | Discrim. | Difficulty (logits) | L&M competency |
|---|---|---:|---:|---|
| 01 | Typical applications | 2.874 | 0.672 | Recognizing AI |
| 02 | Recognizing a chatbot | 0.722 | −0.906 | Recognizing AI |
| 03 | AI systems | 0.931 | 1.004 | Interdisciplinarity |
| 04 | Interdisciplinary research fields | 2.252 | 0.206 | Interdisciplinarity |
| 05 | Intelligence of AI | 0.524 | −3.028 | Understanding Intelligence |
| 06 | Intelligence of AI 2 | 0.480 | −2.920 | Understanding Intelligence |
| 07* | Similarities of humans and AI | 0.093 | 0.079 | Understanding Intelligence (eliminated) |
| 08 | Weak and strong AI | 1.758 | 1.224 | General vs. Narrow |
| 09 | Capabilities of weak AI | 1.739 | 0.186 | General vs. Narrow |
| 10 | Superiority of AI | 2.292 | 0.358 | Strengths & Weaknesses |
| 11 | Superiority of humans | 0.944 | 0.520 | Strengths & Weaknesses |
| 12 | Knowledge representations | 2.111 | 1.265 | Representations |
| 13 | Knowledge representations | 0.820 | −0.360 | Representations |
| 14 | Decision-making | 0.910 | 1.158 | Decision-Making |
| 15 | Optimization | 1.483 | 0.848 | Decision-Making |
| 16 | Supervised and unsupervised learning | 2.687 | 0.539 | Decision-Making |
| 17 | Iterative process | 1.298 | 0.214 | ML Steps |
| 18 | Steps in supervised learning (sort) | 1.682 | −0.155 | ML Steps |
| 19 | Training and test data | 1.565 | 0.160 | ML Steps |
| 20 | Human influence | 1.521 | −0.019 | Human Role |
| 21 | Human influence 2 | 1.489 | 0.431 | Human Role |
| 22 | Programmability | 1.494 | −1.093 | Programmability |
| 23 | Visualization of data | 1.266 | −0.396 | Data Literacy |
| 24 | Learning from data | 1.409 | −1.245 | Learning from Data |
| 25 | Learning from user data | 1.444 | 0.592 | Learning from Data |
| 26 | Representativeness of data | 1.394 | −1.280 | Critically Interpreting Data |
| 27 | Ethical principles | 0.847 | 2.932 | Ethics |
| 28 | Black box | 2.865 | −0.162 | Ethics |
| 29 | Societal challenges | 1.804 | −1.033 | Ethics |
| 30 | Risks of AI | 2.250 | 0.240 | Ethics |
| 31 | Legal challenges | 0.707 | 0.790 | Ethics |

Note: verbatim multiple-choice item wording is in the paper's online Supplementary Appendix (referenced p. 3, §2.1.3: "All items can be viewed in the appendix"), not in the main PDF text we have on hand. Action: pull supplementary file before IRB to lock pre-registered short-form wording.

**Pilot adaptation: 10-item Rasch-scale-preserving short form.** Items selected from the 30-item calibrated set (item 07 excluded) to (a) span ~−1.5 to +1.5 logits with 2 items per ~0.5-logit band and (b) cover all major content groupings, with **4 items concentrated in the Ethics-and-Critical-Interpretation cluster** (the workshop's behavioral target).

| # | Short label | Difficulty | Domain (rolled up) | Band |
|---|---|---:|---|---|
| 26 | Representativeness of data | −1.280 | Critically Interpreting Data | [−1.5, −1.0) |
| 29 | Societal challenges | −1.033 | Ethics | [−1.5, −1.0) |
| 23 | Visualization of data | −0.396 | Data Literacy | [−0.5, 0.0) |
| 13 | Knowledge representations | −0.360 | Representations | [−0.5, 0.0) |
| 28 | Black box | −0.162 | Ethics | [−0.5, 0.0) |
| 19 | Training and test data | 0.160 | ML Steps | [0.0, 0.5) |
| 30 | Risks of AI | 0.240 | Ethics | [0.0, 0.5) |
| 21 | Human influence 2 | 0.431 | Human Role | [0.0, 0.5) |
| 25 | Learning from user data | 0.592 | Learning from Data | [0.5, 1.0) |
| 31 | Legal challenges | 0.790 | Ethics | [0.5, 1.0) |

Logit span: −1.280 to +0.790 (1.07 SDs below the calibration mean to 0.87 above). The two extreme items at +2.9 (Item 27 Ethical principles) and −2.9/−3.0 (Items 5, 6) are excluded because (a) they sit outside the −1.5 to +1.5 target band the outline pre-specified and (b) the paper itself flags items 5, 6 (very low) and 27 (very high) as outlier-difficulty items that introduce gaps in the Wright Map (p. 5, §3.5). Ethics-cluster items 28, 29, 30, 31 give the requested 4-item concentration in the workshop-critical content domain. The set covers seven of the L&M competencies represented in the original test, slightly under the "≥2 items per domain" target — a known consequence of also enforcing the difficulty band: items at extreme difficulties are concentrated in *Understanding Intelligence* (5, 6) and a single *Ethics* item (27), so dropping extremes also drops *Understanding Intelligence* coverage. Acknowledge in pre-registration; the workshop does not engage that competency directly.

**Estimated person-separation reliability for the 10-item subset.** Using the Spearman–Brown short-form approximation r' = (k · r) / (1 + (k − 1) · r) with k = 10/30 = 0.333 and full-form r = 0.85: r' = (0.333 × 0.85) / (1 + (0.333 − 1) × 0.85) = 0.2833 / (1 − 0.5667) = 0.2833 / 0.4333 = **r' ≈ 0.654**. Rough lower bound from Cronbach's α = 0.82: r' = (0.333 × 0.82)/(1 + (−0.667)(0.82)) = 0.2733/0.4533 = **0.603**. Estimated short-form person-separation reliability: **~0.60–0.65**. Adequate for between-group pre/post comparison (the planned use) but not for high-stakes individual scoring. The outline's previous estimate (~0.55–0.60) was slightly pessimistic.

Split into **two 5-item parallel forms (A pre / B post, counterbalanced)** to minimize testing-effect contamination. Form A: items 26, 23, 19, 25, 30. Form B: items 29, 13, 28, 21, 31. Both forms span ~−1.3 to +0.8 logits and contain ≥2 Ethics-cluster items each. Score on Rasch logit scale (anchor item difficulties to the published 3-PL estimates), not raw % correct, so pre→post change is interval-scaled. Total: ~4 min pre + ~4 min post = 8 min objective testing.

**Open verification gap:** Verbatim item wording must be pulled from the Hornberger online Supplementary Appendix and locked before IRB submission and pre-registration.

### 7.3 Behavioral follow-up — Clerc-adapted, 1 week post

Clerc et al. (2026) ran a 90-min behavioral test 2 days post-workshop (intervention n=76 / control n=40). They found:

> "Trained students showed less uncritical reliance on the system: they more often reformulated queries, asked follow-up questions, and more accurately judged response correctness, leading to better performance. In contrast, GenAI and metacognitive self-report scores did not predict performance." — Clerc et al. 2026, abstract

> "trained students were less likely than controls to accept underspecified prompts (51.5% vs. 66.7%, p = .044), with no group difference for well-specified prompts." — Clerc et al. 2026, §3.2

> "They were also much more likely to ask follow-up questions when accepted initial prompts were underspecified (59.2% vs. 27.9%, p < 0.001)." — Clerc et al. 2026, §3.2

> "GenAI self-report scores were not significantly correlated with performance (r = 0.01, p = .88, R² < .001, n = 116)." — Clerc et al. 2026, §3.4

A 90-min in-lab session does not fit a faculty/staff workshop. We adapt to a **15-minute online behavioral mini-battery delivered 1 week post**:

1. **Prompt-quality discrimination** (~5 min). Six prompts (3 well-specified, 3 underspecified) for a sample task; participants accept-or-rewrite each. Score: rejection rate of underspecified prompts (Clerc benchmark: 51.5% trained vs 66.7% control acceptance).

2. **Output-evaluation accuracy** (~5 min). Four LLM responses (2 correct, 2 plausibly wrong) to the same query; judge correctness on 3-point scale. Score: signal-detection d′ on correctness judgment.

3. **Follow-up rate on underspecified prompt** (~5 min). One open task with the participant's own LLM access; log whether they ask a follow-up after the initial underspecified prompt. Score: follow-up rate (Clerc: 59.2% trained vs 27.9% control).

**Why 1 week, not 2 days:** faculty calendars don't accept 2-day windows; Clerc's effects survived 2 days, and 1-week is a more credible durability claim for CHI.

**Demote Puppart-style binary over-reliance task to exploratory** (would require n≈400/arm given Puppart & Aru 2025's d=−0.25 null and their own caution: "even if future work would show a significant effect with a larger sample, the present work hints that the effect size of the manipulation would likely not be large" — Puppart & Aru 2025, p. 14). Their iatrogenic finding — "the mean under-reliance was higher in the intervention group (M = 36.84, SD = 24.11) compared to the control group (M = 19.12, SD = 20.78) … t(34) = 2.35, p = .025, d = 0.78" (p. 9) — argues for *tracking* under-reliance as a check, not *primarily testing* over-reliance.

### 7.4 Calibration — the Dunning-Kruger gap

A signature outcome: **self-rated knowledge minus objective knowledge** should *shrink* in the Workbench arm. This pre-empts the "self-report inflation" critique that Su et al.'s 2025 review highlights and that Clerc et al. 2026 (§3.4) document directly. Bashardoust et al. (2024) found exactly this calibration signature in their journalist sample: perceived expertise *up*, perceived helpfulness *down*. Pre-register the prediction.

> "feeling confident with GenAI is not equivalent to using it effectively, underscoring the value of process- and performance-based measures when evaluating AI literacy interventions." — Clerc et al. 2026, §4.3

> "AI literacy training can help put the abilities of AI tools into perspective and make limitations more apparent. This, in turn, is likely to lower the perceived helpfulness of such tools." — Bashardoust et al. 2024, p. 11

### 7.5 Measurement timeline

| Wave | Timing | Battery | Duration |
|---|---|---|---|
| Pre | Day 0, immediately before workshop | Demographics + MAILS (24) + SNAIL Critical Appraisal + GAAIS + Hornberger Form A (5) | ~15 min |
| Immediate post | Day 0, immediately after workshop | MAILS subscales (repeat) + SNAIL Critical Appraisal (repeat) + Hornberger Form B (5) + workshop reaction (5 items) + self-rated knowledge confidence | ~12 min |
| 1-week follow-up | Day 7 ± 2, online | Clerc-adapted behavioral mini-battery + 3-item Hornberger retention check | ~18 min |
| (Optional) 1-month follow-up | Day 30 ± 7 | Hornberger Form A repeat + 5-item MAILS Understand AI subscale + open-ended | ~10 min |

**Note on precedent.** Cao et al. (2025) measured outcomes only at a single immediate-post timepoint within a 30-40 minute Qualtrics session — "After viewing the clips and answering AI knowledge questions, both groups completed measures of self-efficacy of understanding, use, and evaluation of AI, fear of AI, and demographics" (Cao et al. 2025, p. 3) — and report no delayed follow-up. Importantly, Cao's *outcome* battery (self-efficacy, fear) was administered **only post**, not pre/post; baseline equivalence was checked via a separate 6-item Pew quiz pre-intervention (p. 4). Our 1-week (and optional 1-month) wave is therefore a methodological strengthening over Cao, addressing exactly the retention/transfer gap Bhat & Long (2024) flag verbatim: "the study's duration and setting did not allow for assessing long-term retention of AI concepts. Therefore, while immediate increases in AI literacy were observed, we cannot confirm sustained knowledge without follow-up studies" (Bhat & Long 2024, p. 13).

---

## 8. Recruitment and audience

### 8.1 Channels (in priority order)

1. **CATLR Fellows network** — already self-selected for teaching innovation; easy brief.
2. **Library / IT staff listservs** — KU's 2024 institute included librarians + an IT specialist (Conrad & Kamperman 2025, p. 148); cross-role mixing surfaced cross-functional insights ("hallway and water cooler conversations" — p. 148).
3. **Provost / chancellor-affiliated faculty-development mailing lists** — formal endorsement signal; lays groundwork for Phase 2.
4. **Departmental-chair email** to Khoury, COE, CSSH, Bouvé chairs requesting forwarded announcements (broadens disciplinary range).
5. **Targeted outreach to known AI-skeptics** (e.g., humanities programs that have publicly opposed GenAI in coursework). Volunteer-bias mitigation; see §8.4.

### 8.2 Stratification variables (single intake form)

- Role (tenure-track faculty / NTT faculty / staff / librarian / IT / postdoc)
- Primary discipline (STEM / SSH / professional school / non-academic)
- Self-reported AI use frequency (5-point: never / monthly / weekly / daily / multiple times daily)
- Prior AI-PD attendance (yes/no + brief description)
- Years at NEU; years in current role
- Pre-existing stance toward GenAI in education (5-point: enthusiastic → opposed)

### 8.3 Incentives

$50 stipend OR catered lunch + a CATLR-affiliated micro-credential / completion certificate. Bashardoust ran without monetary incentives but with strong job-relevance pull (2024, p. 8); NEU should add a token incentive because Workbench has no equivalent professional-demand hook.

Conrad & Kamperman (2025, p. 154) flag that institutional support requires "respect for and valuing of educators' time through professional development credit and funding." Stipend + credit is the minimum bar.

### 8.4 Volunteer-bias mitigation

Both KU (Conrad & Kamperman 2025) and Bashardoust et al. (2024) drew self-selected AI-positive samples. Mitigations:

- Targeted outreach to AI-skeptic departments
- Capture baseline AI-stance as a covariate; report attrition by stance
- Frame findings as conditional on a self-selected sample
- Pre-register sub-group analyses by baseline stance

### 8.5 Realistic recruitment funnel

KU Institute: 33 applied → 27 accepted → 23 attended (Conrad & Kamperman 2025, p. 148). Bashardoust et al.: 37 invited → 29 valid (2024, p. 8). Plan for **~25-30% attrition** between sign-up and complete-instruments.

To reach n=300 completers (100/arm), aim for **400 sign-ups across two summer cohorts** (June + August). Or accept 2-arm design at n=80-90/arm for a single cohort.

---

## 9. Anticipated effects and pre-registered predictions

### 9.1 Headline predictions

1. **Workbench arm > Active control on Hornberger objective knowledge.** Predicted d ≈ 0.4 (smaller than Zhao's Basic vs Explorable d-equivalent ~0.7 because both arms get critical-framing scaffold).
2. **Workbench arm ≥ Active control on SNAIL Critical Appraisal.** Predicted d ≈ 0.3-0.4. Drives the "interpretability adds critical literacy beyond architecture" claim.
3. **Workbench arm > Both controls on 1-week behavioral follow-up.** Specifically: underspecified-prompt rejection rate, follow-up question rate, output-correctness judgment d′. Each at d ≈ 0.4.
4. **Workbench arm shows larger calibration shift** than Active control — the gap between self-rated and objective knowledge shrinks more.
5. **Perceived helpfulness of GenAI declines** in Workbench arm (Bashardoust 2024 signature: p. 1, p. 11). Pre-register this prediction so reviewers don't read it as null.
6. **Active control ≈ Workbench on MAILS Use & Apply AI.** Both arms expose participants to GenAI; gain on this subscale is not a discriminator. We predict the discriminator subscales are MAILS Understand AI, MAILS AI Ethics, and SNAIL Critical Appraisal.

### 9.2 Sub-group predictions

- Faculty with no prior AI-PD show larger gains than those with prior PD (ceiling effects).
- Library + IT staff show the largest gains on objective measures (highest motivation, lowest priors).
- Humanities / SSH faculty show the largest gains on critical-appraisal measures (closest content fit).
- Engineering / CS faculty show the smallest gains on objective measures (priors already high) but match on critical-appraisal.

---

## 10. Pre-empted reviewer pushbacks (CHI 2027)

1. **"You didn't measure transfer / retention."** Both Bhat & Long 2024 and Cho et al. (Transformer Explainer) are vulnerable here. Bhat & Long explicitly concede: "the study's duration and setting did not allow for assessing long-term retention of AI concepts. Therefore, while immediate increases in AI literacy were observed, we cannot confirm sustained knowledge without follow-up studies" (Bhat & Long 2024, p. 13). Cho et al. acknowledge: "our evaluation measured learning outcomes immediately after the session… does not assess long-term retention or transfer" (Cho et al. 2026, §10.3). *Pre-empt:* 1-week behavioral follow-up + optional 1-month Hornberger retention check.

2. **"Your control isn't matched on engagement / time-on-task."** Self-evident if our control is passive. *Pre-empt:* the 3-arm design with an *active interactive non-interpretability* control (architecture-level walkthrough) isolates *interpretability*, not just *interactivity*.

3. **"Single session, n is small, faculty self-select."** Standard CHI critique. *Pre-empt:* power analysis up front with ranged effect sizes; report effect sizes with CIs not p-values; describe recruitment so selection bias is legible; frame explicitly as a Phase 1 pilot with planned Phase 2 university-wide rollout.

4. **"Subjective literacy gains aren't literacy."** MAILS/SNAIL self-efficacy items, taken alone, are vulnerable. *Pre-empt:* Hornberger objective component + Clerc-adapted behavioral measures + calibration analysis (gap shrinks). Clerc 2026 directly justifies this triangulation: "feeling confident with GenAI is not equivalent to using it effectively, underscoring the value of process- and performance-based measures" (§4.3).

5. **"Why is mechanistic interpretability the right level for *literacy*, as opposed to architecture-level (Cho et al.) which is already accessible?"** This is the novelty review. *Pre-empt:* Cho et al. 2026 (CHI 2026, n=90) establish the architecture-only ceiling empirically: 73.3% mean quiz accuracy on 7 mechanism-aligned items, with statistically significant gains over both blog and video baselines (p=0.021 each, §9.1.1) and significantly higher self-efficacy than video (p=0.047, §9.2). Cho's measures are post-only architectural quiz accuracy + UMUX-Lite usability + Intrinsic Motivation Inventory engagement + NASA-TLX mental demand (§8.4.1) — they explicitly "excluded detailed assessment of mathematical mechanisms" (§10.3) and "focus on short-term conceptual gains rather than long-term retention or transfer" (§9.4.3). Critically, Cho et al. report no measure of critical/ethical appraisal, harm-domain knowledge, prompt-quality discrimination, or behavioral over-reliance — none of the constructs that critical AI literacy targets. Their headline qualitative finding — "I feel that I could map out the process… the equivalent of a children's drawing of the solar system in crayon. I understand that everything moves about one another" (§9.2, participant) — is exactly the kind of architectural confidence-without-critical-purchase that motivates our dose-response hypothesis: depth of mechanistic engagement predicts *critical-framing* gains beyond architectural literacy. Our 3-arm design tests whether interactive *interpretability* (Workbench) outperforms Cho's already-effective architectural ceiling on SNAIL Critical Appraisal, MAILS Understand AI/AI Ethics, and Clerc-derived behavioral DVs. If Workbench ≈ Active control on these critical/behavioral measures, the literacy claim weakens — but the result remains informative because it cleanly bounds what architecture-level interactive learning can and cannot deliver. Bhat & Long 2024 (n=42, the closest tool-mediated precedent) cannot answer this question at all: they have *no control condition* — only a within-subjects pre/post on a single group, with significance assessed by paired t-tests (Bhat & Long 2024, §4.4.1). Their tools (Edge Detection, Confidence Calibration Explorer, Sensitivity Toggling) teach computer-vision primitives — Canny edge detection, object-detection confidence thresholds, and gesture-recognition sensitivity/specificity tradeoffs. They report "a statistically significant increase in self-efficacy related to both understanding and applying the identified AI concepts across the board (p < 0.01)" (p. 9) but no effect sizes and no objective standardized measure — comprehension was assessed via rater-graded open-ended responses on a 0-3 Bloom's-Taxonomy rubric (p. 8, §4.4.2). Workbench's 3-arm RCT with Hornberger-objective + Clerc-behavioral measurement is a methodological generation beyond this evidence base.

6. **"Faculty/staff aren't the population CHI cares about."** *Pre-empt:* frame faculty as multipliers (policy, curriculum, downstream-student exposure); Phase 2 explicitly extends to students. Cite Conrad & Kamperman 2025, p. 142, p. 146 for the dependency argument; Bashardoust 2024 for the under-studied-population gap.

7. **"You replicated KU; what's new?"** *Pre-empt:* KU is a 5-day in-person institute with no rigorous evaluation (Conrad & Kamperman 2025 explicitly call it "a practice account, not a blueprint," p. 146). Our pilot is an evaluable, single-session, 3-arm RCT testing a different hypothesis (interactive interpretability as critical-literacy vehicle). Different mechanism, different scale, different evidence type.

8. **"Your harms list is exhaustive but you only have 35 minutes; how can you do justice?"** *Pre-empt:* the workshop covers three harm domains (hallucination, stereotype, one chosen by participant) with depth, not all six listed. Acknowledge depth-vs-breadth tradeoff; cite Conrad & Kamperman's own institute, which focused on a curated subset.

---

## 11. Risks, limitations, ethics

### 11.1 Methodological risks

- **Self-report inflation on MAILS** in faculty/staff sample. Mitigation: triangulate with Hornberger + behavioral.
- **Ceiling effects on MAILS Use & Apply AI** for technical staff (Carolus et al. 2023's German-2023 baselines were "rather low use of AI" — p. 5; NEU 2026 baselines will be higher, especially among CS/IT). Mitigation: report ceiling-effect rates per subscale; frame as boundary condition.
- **Test-retest reliability not reported** for MAILS (Carolus et al. 2023 acknowledge this gap, p. 8). Mitigation: explicit caveat in IRB and CHI write-up; treat MAILS gain scores as a *proxy for perceived competency change*, not literacy change per se.
- **Demand characteristics.** Faculty want to please facilitators. Mitigation: anonymous post-instruments via external link not in-room; 3-arm design absorbs Hawthorne effect.
- **Volunteer bias.** Mitigation: see §8.4.
- **Order effects from fixed Workbench-task sequence within Movement 2.** Bhat & Long 2024 flag this as their first limitation: "the ordering of the tools during the testing sessions was not randomized, which may have influenced how participants responded to subsequent tools, potentially introducing order effects" (p. 13). Mitigation: counterbalance the three Workbench tasks (logit lens / activation patching / self-paced) across participants within each arm; pre-register order as a covariate.
- **Scaffolding contamination from text plaques / facilitator narration.** Bhat & Long flag: "the presence of text plaques alongside interactive elements may have influenced user understanding and interaction patterns. While these textual descriptions are designed to enhance learning by providing context … they could have also provided scaffolding that impacted how participants engaged with and perceived the interactive elements independently" (p. 13). Mitigation: standardize facilitator script across arms; treat scaffold density as a variable to report, not a confounder to hide.

### 11.2 Ethical / framing risks

- **Critical-AI-literacy reviewers** (CHI HCI camp) may read the DEC-vocabulary alignment as instrumentalist drift. Mitigation: the explicit reconciliation in §3.3 — DEC's *AI-Resilience* and *Priority 1* are protected; AI-Integrated as default is rejected.
- **Provost-side readers** may read the critical-AI framing as politically charged. Mitigation: the Phase-1 framing as "decision-making capacity for faculty" rather than advocacy; let faculty themselves arrive at AI-Free / AI-Assisted / AI-Integrated / refusal.
- **Workbench infrastructure dependency.** If NDIF is down on workshop day, the intervention can't run. Mitigation: dev-container infra on MGHPCC servers (already in flight per 2026-04-27 meeting notes); rehearsed offline/recorded fallback.

### 11.3 IRB-relevant ethics

- **Audio/video recording** of workshop for qualitative analysis — opt-in, separable from primary participation.
- **Behavioral follow-up** uses participant's own LLM access — clarify data flow, no logging beyond what participant submits via task interface.
- **De-identification** at intake; link via study ID only.
- **Compensation** ($50 + lunch) does not cross IRB-coercion threshold for NEU staff base salaries.

---

## 12. Timeline

| Date | Milestone |
|---|---|
| 2026-05-15 | IRB draft (Gwen) |
| 2026-05-22 | IRB final submission |
| 2026-05-22 → 2026-06-15 | IRB review window |
| 2026-06-01 → 2026-06-30 | Workshop materials build (Gwen + Adam); behavioral instruments build; intake form deployed |
| 2026-06-15 → 2026-07-15 | Recruitment Cohort 1 (target ~150 sign-ups) |
| 2026-07-08 → 2026-07-22 | Workshop sessions, Cohort 1 |
| 2026-07-15 → 2026-07-29 | 1-week behavioral follow-ups, Cohort 1 |
| 2026-08-01 → 2026-08-25 | Recruitment + workshops, Cohort 2 (if needed for n target) |
| 2026-09-01 → 2026-09-30 | Data cleaning + analysis |
| 2026-10-01 → 2026-10-30 | Optional 1-month retention follow-up |
| 2026-11-15 | Draft CHI 2027 submission |
| 2026-12-15 | Provost-side debrief on Phase 1; Phase 2 scoping if results support |

---

## 13. Verification action items — fulltexts to fetch/attach

The following Zotero items lack fulltext PDFs as of 2026-04-30. Each is load-bearing for one or more outline sections. Action: fetch PDFs (open-access where possible; via NEU library otherwise) and attach to Zotero before IRB submission.

1. **Cao et al. 2025** (item `NTQJU47F`, doi:10.1145/3706598.3713254). **§6.1, §7.5** — ~~verify (a) sample size, (b) control video selection / matching procedure, (c) measurement timing.~~ **RESOLVED 2026-04-30:** n=94 (control 34 / treatment 60, 1:2 random allocation), 14-min treatment vs 13.5-min control video battery (matched on duration + AI-relevance, NOT on independent rater content audit), single immediate-post measurement only (no delayed follow-up). Outcomes via partial η² (no Cohen's d reported): self-efficacy of AI use η²=.04 p=.050, evaluation η²=.03 p=.09 (marginal), understanding η²=.01 p=.321 (null); fear of bias η²=.07, privacy η²=.08, job replacement η²=.05 — all directionally up, interpreted by authors as critical-thinking calibration. **Remaining gap:** Cohen's d not reported; subscale item counts not reported. §6.1 and §7.5 updated.
2. **Bhat & Long 2024** (item `PPGRUNCM`, doi:10.1145/3643834.3660722). **§3, §10 (pushback 5), §11.1** — ~~verify n=42 procedure, measures used, stated limitations.~~ **RESOLVED 2026-04-30:** n=42, library intercept recruitment (novice-only), no control condition (within-subjects pre/post only, paired t-tests, p < 0.01 across self-efficacy items), no objective standardized measure (rubric-graded open-ended on 0-3 Bloom's scale), no retention follow-up. Three tools (Edge Detection / Confidence Calibration / Sensitivity Toggling) teach CV primitives. Authors flag: tool order not randomized, library convenience sample, no retention assessment. **Remaining gap:** no effect sizes (Cohen's d, η²) reported. §10 and §11.1 updated.
3. **Cho et al. 2026** — Transformer Explainer CHI 2026 full paper (item `E94D2CP2`, doi:10.1145/3772318.3791725). **§6.1 (Active control arm), §10 (pushback 5)** — ~~verify the n=90 user-study design referenced in the synthesis.~~ **RESOLVED 2026-04-30:** n=90 confirmed; between-subjects Prolific study with $12 compensation, 43-min mean completion, 45-min capped tool exposure; 7-item LO-aligned MC quiz + UMUX-Lite + IMI engagement + NASA-TLX + 5-pt Likert self-rated understanding + open-ended thematic analysis; GLMM (binomial logit) with Holm-corrected one-sided contrasts. Headline: TE 73.3% vs Blog/Video both p=0.021. Public deployment: 490,000+ users across 200+ countries. §6.1 and §10 pushback 5 updated.
4. **Laupichler et al. 2023 — SNAIL development** (item `UFSZF8MI`, doi:10.1016/j.chbr.2023.100338). **§7.1** — ~~verify Critical Appraisal item count and α; pull sample items.~~ **RESOLVED 2026-04-30:** F2 Critical Appraisal = 10 items, α = 0.91 (CI 0.89–0.93); EFA n=415; salient-loading threshold 0.32. Sample-item exemplars pulled from Delphi Table 2 (companion paper). Per-item V##→Delphi# crosswalk is in Supplementary Material 1; pull before pre-registration.
5. **Laupichler et al. 2023 — SNAIL Delphi** (item `DQKR9KQ5`, doi:10.1016/j.caeai.2023.100126). **§7.1** — ~~verify final Delphi-validated item set and content-validity evidence.~~ **RESOLVED 2026-04-30:** 53 SMEs, 3 iterative rounds; 47 candidate items → 38 included; consensus via hierarchical rules (no fixed CVR cutoff after Round 1 dispersion); three early-consensus items (Round 1 median=10) anchor the Critical-Appraisal content domain.
6. **Hornberger et al. 2023** (item `BKD2X7UF`, doi:10.1016/j.caeai.2023.100165). **§7.2** — ~~verify 31-item structure, IRT difficulty table, person-separation reliability, sample item wordings.~~ **RESOLVED 2026-04-30 (partial):** 30 MC + 1 sorting = 31 items (Item 07 dropped post-calibration → 30 active), 3-PL IRT, N=1286; α = 0.82; EAP r = 0.85; full Table 5 difficulties transcribed into §7.2; 10-item short form proposed (logits −1.28 to +0.79; estimated r' ≈ 0.60–0.65). **Remaining gap:** verbatim multiple-choice item wording is in the online Supplementary Appendix (not in main PDF); pull before pre-registration to lock short-form item text.

**Resolution status (2026-04-30):** All 6 fulltext PDFs attached; agents 1, 2, 3 ran a verification pass and updated §6.1, §7.1, §7.2, §7.5, §10, §11.1, §13 with direct page-anchored quotes from the now-readable fulltexts. Two narrow supplementary-material gaps remain: Hornberger online appendix (verbatim MC item wording, blocks short-form pre-registration) and SNAIL Supplementary Material 1 (V##→Delphi# crosswalk for the 10 retained Critical Appraisal items). Both are pull-and-attach actions (~30 min) — needed before IRB submission and pre-registration.

---

## 14. Citations index (alphabetical)

- **Bashardoust et al. 2024** — "The Effect of Education in Prompt Engineering: Evidence from Journalists." arXiv:2409.12320. Item `7RKKXFGN`.
- **Carolus et al. 2023** — "MAILS - Meta AI literacy scale: Development and testing of an AI literacy questionnaire." *Computers in Human Behavior: Artificial Humans* 1(2):100014. Item `TR24QEHR`.
- **Bhat & Long 2024** — "Designing Interactive Explainable AI Tools for Algorithmic Literacy and Transparency." DIS '24, doi:10.1145/3643834.3660722. Item `PPGRUNCM`. PDF attached 2026-04-30.
- **Cao, Lee & Peng 2025** — "Empowering Adults with AI Literacy: Using Short Videos to Transform Understanding and Harness Fear for Critical Thinking." CHI 2025, doi:10.1145/3706598.3713254. Item `NTQJU47F`. PDF attached 2026-04-30.
- **Cho et al. 2024** — "Transformer Explainer." arXiv:2408.04619 (v1, IEEE VIS short paper). Item `ETJ9E843`.
- **Cho et al. 2026** — "Transformer Explainer: Interactive Learning of Text-Generative Models." CHI 2026 full paper, doi:10.1145/3772318.3791725. Item `E94D2CP2`. PDF attached 2026-04-30; n=90 user study version.
- **Clerc et al. 2026** — "Teaching Students to Question the Machine: An AI Literacy Intervention Improves Students' Regulation of LLM Use in a Science Task." arXiv:2604.01955. Item `3JUD6SKA`.
- **Conrad & Kamperman 2025** — "Building Critical AI Literacy: An Approach to Generative AI." *Thresholds in Education* 48(2):142-158. Item `RKL4Q4AA`.
- **DEC 2025** — *The Next Era of Assessment: A Global Review of AI in Assessment Design.* Digital Education Council in partnership with Pearson, NEU-licensed. Item `SDH6T529`.
- **Hornberger et al. 2023** — "What do university students know about Artificial Intelligence?" *Computers and Education: Artificial Intelligence* 5:100165. Item `BKD2X7UF`. PDF attached 2026-04-30; supplementary appendix (verbatim item wording) still to pull.
- **Laupichler et al. 2023a** — SNAIL development paper, *Computers in Human Behavior Reports* (doi:10.1016/j.chbr.2023.100338). Item `UFSZF8MI`. PDF attached 2026-04-30; Supplementary Material 1 (V##→Delphi# crosswalk, per-item factor loadings) still to pull.
- **Laupichler et al. 2023b** — SNAIL Delphi, *Computers and Education: AI* (doi:10.1016/j.caeai.2023.100126). Item `DQKR9KQ5`. PDF attached 2026-04-30.
- **Puppart & Aru 2025** — "Short-term AI literacy intervention does not reduce over-reliance on incorrect ChatGPT recommendations." arXiv:2503.10556. Item `MEASP4PK`.
- **Rapanta et al. 2025** — "Critical GenAI Literacy: Postdigital Configurations." *Postdigital Science and Education* 7(4):1296-1333. Item `665IA6HT`.
- **Su et al. 2025** — "A Scoping Review of Empirical Research on AI Literacy Assessments." *Educational Technology R&D* 73(5). Item `XD8JERWA`.
- **Zhao et al. 2024** — "Thinking Like a Scientist: Can Interactive Simulations Foster Critical AI Literacy?" arXiv:2507.21090. Item `3I6CRJSR`.

---

**Synthesis source.** Built from 6 parallel opus-agent deep-reads (2026-04-30) over the Workbench AI Literacy group library (Zotero group 6536646, ~57 items). Each agent extracted citation-rich material on one project dimension: (1) study design + control conditions, (2) tool-mediated literacy precedents, (3) self-report instruments, (4) objective + behavioral measures, (5) critical framing + DEC vocabulary, (6) faculty/staff audience justification + recruitment. Full agent reports archived in conversation context.
