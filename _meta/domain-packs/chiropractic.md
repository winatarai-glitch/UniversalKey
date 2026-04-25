---
title: Domain Pack — Chiropractic
type: meta
tags: [meta, taxonomy, domain-pack, chiropractic]
domain: chiropractic
language_primary: no
language_secondary: en
created: 2026-04-25
---

# Domain Pack — Chiropractic

Chiropractic-specific extension of `_meta/taxonomy-core.md`. Activated when
`ACTIVE_PACK=chiropractic` in `.env`.

Bilingual (Norwegian + English) — clinical aliases below let
`tools/tag-and-frontmatter.mjs` match either language during ingest.

## Clinical Conditions
- `condition/bppv`, `condition/vertigo`, `condition/dizziness`
- `condition/neck-pain`, `condition/low-back-pain`, `condition/sciatica`
- `condition/shoulder`, `condition/frozen-shoulder`
- `condition/knee`, `condition/hip`, `condition/foot`
- `condition/headache`, `condition/migraine`
- `condition/thoracic-kyphosis`, `condition/scoliosis`
- `condition/tbi`, `condition/costochondritis`, `condition/plantar-fasciitis`
- `condition/tennis-elbow`, `condition/rotator-cuff`, `condition/nystagmus`, `condition/disc-herniation`

## Body Region
- `region/cervical`, `region/thoracic`, `region/lumbar`
- `region/shoulder`, `region/elbow`, `region/wrist`
- `region/hip`, `region/knee`, `region/ankle`, `region/foot`
- `region/tmj`, `region/vestibular`
- `region/scapular`

## Domain Content Types (extend core `type/`)
- `type/clinical-letter` — letter to a referring practitioner
- `type/exercise-guide` — patient-facing exercise instructions
- `type/treatment-protocol` — clinic-internal protocol

## Domain Audience Values (extend core `audience/`)
- `audience/clinical-tool` — daily clinical use; bilingual NO+EN priority
- `audience/curriculum-anchor` — prerequisite or learning-path hub for curriculum pillar
- `audience/contested` — `confidence: contested` default; both-sides citations required
- `audience/signature-cluster` — page belongs to a thematic method/lineage cluster within the pack

## Technique
- `technique/manipulation`, `technique/mobilization`
- `technique/rehabilitation`, `technique/dry-needling`
- `technique/bppv-maneuver`, `technique/exercise-prescription`
- `technique/traction`, `technique/soft-tissue`
- `technique/shockwave`, `technique/iastm`, `technique/red-light`

## Technique Family (technique-as-entity)
Families correspond to pages under `entities/things/techniques/` (or your
chosen entity-subfolder convention).
- `technique-family/gonstead`
- `technique-family/diversified`
- `technique-family/activator-method`
- `technique-family/sot` (sacro-occipital technique)
- `technique-family/thompson`
- `technique-family/toggle-recoil`
- `technique-family/torque-release`
- `technique-family/koren-specific` (KST)
- `technique-family/network-spinal` (NSA)
- `technique-family/applied-kinesiology` (AK)
- `technique-family/neuro-emotional-technique` (NET)
- `technique-family/neural-organization-technique` (NOT)
- `technique-family/dynamic-neuromuscular-stabilization` (DNS)
- `technique-family/fascial-manipulation`
- `technique-family/cranio-sacral`
- `technique-family/functional-medicine`
- `technique-family/motion-palpation`
- `technique-family/neuroimpulse-protocol` (NIP)
- `technique-family/bio-energetic-synchronization` (BEST)
- `technique-family/bio-geometric-integration` (BGI)
- `technique-family/contact-reflex-analysis` (CRA)
- `technique-family/total-body-modification` (TBM)
- `technique-family/pathway-layers` (PL)
- `technique-family/multi-layer-body-approach` (MLBA)
- `technique-family/3dbios`
- `technique-family/functional-neurology`
- `technique-family/brain-based-chiropractic`
- `technique-family/mckenzie`
- `technique-family/mulligan`

## Faculty (entity references)
Slug pattern: `{surname}-{firstname}`, lowercased, ASCII. Populate as you
ingest your own corpus — examples are illustrative of the slug convention.

## Course (entity references)
Slug pattern: `{topic}-{format}-{year}` or similar. Populate per your corpus.

## Book (entity references)
Slug pattern: `{topic}-{author-surname}` or similar. Populate per your corpus.

## Organization
Slug examples for chiropractic-domain organizations:
- `org/aecc` (Anglo-European College of Chiropractic)
- `org/icpa` (International Chiropractic Pediatric Association)
- `org/iceca`
- `org/motion-palpation-institute`
- `org/american-posture-institute`
- `org/sherman-college`
- `org/palmer-college`
- `org/ifec`

## Tools & Instruments
- `tool/activator-gun`, `tool/arthrostim`, `tool/impulse-adjuster`
- `tool/denneroll`, `tool/cervical-traction`, `tool/flexion-distraction-table`
- `tool/drop-piece-table`, `tool/thompson-table`
- `tool/iastm-tools`
- `tool/shockwave-device`, `tool/eswt`
- `tool/red-light-device`, `tool/pbm`
- `tool/tens-unit`, `tool/ifc-unit`
- `tool/dry-needles`
- `tool/videonystagmography` (VNG), `tool/frenzel-goggles`

## Concept Subtypes
Concept-layer pages live at `concepts/<subfolder>/<slug>.md`.

- `concept/anatomy/muscle`, `concept/anatomy/joint`, `concept/anatomy/nerve`, `concept/anatomy/fascia`, `concept/anatomy/viscera`
- `concept/function/firing-pattern`, `concept/function/motor-control`, `concept/function/proprioception`
- `concept/dysfunction/imbalance`, `concept/dysfunction/compensation`, `concept/dysfunction/pain-phenotype`
- `concept/clinical-reasoning/differential`, `concept/clinical-reasoning/red-flag`, `concept/clinical-reasoning/outcome-measure`, `concept/clinical-reasoning/phenotype`
- `concept/methodology/mmt`, `concept/methodology/palpation`, `concept/methodology/provocation-test`, `concept/methodology/imaging`
- `concept/neurological/hemisphericity`, `concept/neurological/cerebellar`, `concept/neurological/vestibular`, `concept/neurological/primitive-reflex`, `concept/neurological/cns-integration`
- `concept/dental-occlusion/bite-alignment`, `concept/dental-occlusion/tmj-biomechanics`, `concept/dental-occlusion/trigeminal-input`, `concept/dental-occlusion/posture-bite-link`
- `concept/sport-performance/reaction-time`, `concept/sport-performance/proprioception-metric`, `concept/sport-performance/power-output`
- `concept/eye-movement/saccade`, `concept/eye-movement/smooth-pursuit`, `concept/eye-movement/vor`, `concept/eye-movement/optokinetic`, `concept/eye-movement/gaze-stabilization`
- `concept/nutrition/*`, `concept/biochem/*`, `concept/endocrine/*`
- `concept/psychology/fear-avoidance`, `concept/psychology/catastrophizing`, `concept/psychology/kinesiophobia`
- `concept/pain-neuroscience/central-sensitization`, `concept/pain-neuroscience/nociception`, `concept/pain-neuroscience/neuroplasticity`

## Domain-Specific Status
Extend core `status/`:
- `status/pending-translation-review` — multilingual ingest queue (NO/EN/IT cross-language dedup)
- `status/pending-transcription` — video/audio queued for Whisper/transcription pipeline

## Domain-Specific Source
Extend core `source/`:
- `source/clinical-experience` — first-hand clinical observation

## Relation Edge Types — Concept (chiropractic-specific)

Live in `relations[]` alongside core lineage edges.

**Clinical:** `assesses`, `tests`, `treats`, `indicated-in`, `contraindicated-in`

**Structural:** `part-of`, `requires-prerequisite`

**Functional:** `innervated-by`, `opposes`, `synergist-with`

## Aliases (Machine-Readable, Bilingual NO+EN)

<!-- PARSER: Each line is tag|alias1,alias2,alias3 -->
<!-- Used by tools/tag-and-frontmatter.mjs for keyword matching -->

condition/bppv|bppv,krystallsyke,benign paroxysmal,godartet posisjonsavhengig,benign paroksysmal
condition/vertigo|vertigo,svimmelhet,dizziness,svimmel
condition/dizziness|dizziness,svimmelhet,ørhet
condition/neck-pain|nakkesmerte,nakkesmerter,neck pain,cervical pain,nakkeplager,cervicogen
condition/low-back-pain|korsrygg,lumbago,korsryggsmerter,low back pain,ryggsmerte,korsryggsmerte
condition/sciatica|isjias,sciatica,ischiasnerven,radikulopati
condition/shoulder|skuldersmerter,shoulder pain,skulderplager,skulder
condition/frozen-shoulder|frossen skulder,frozen shoulder,adhesiv kapsulitt
condition/knee|knesmerter,knee pain,kneplager,menisk,kne
condition/hip|hoftesmerter,hip pain,hofteplager,hofte
condition/foot|fotsmerter,foot pain,fotplager,ankelsmerte,hælspore
condition/headache|hodepine,headache,cephalgi,spenningshodepine
condition/migraine|migrene,migraine
condition/thoracic-kyphosis|kyfose,kyphosis,thorakal kyfose,hypokyfose
condition/scoliosis|skoliose,scoliosis
condition/tbi|hjernerystelse,traumatic brain injury,tbi,commotio,concussion,post-commotio,post commotio
condition/costochondritis|kostokondritt,costochondritis,brystsmerte,tietze
condition/plantar-fasciitis|plantar fascitt,plantar fasciitis,hælspore,hælsmerter,plantar
condition/tennis-elbow|tennisalbue,tennis elbow,lateral epikondylitt,epicondylitis
condition/rotator-cuff|rotatorcuff,rotator cuff,supraspinatustendinopati,rotatormansjett
condition/nystagmus|nystagmus,øyeflimmer
condition/disc-herniation|prolaps,disc herniation,skiveprolaps,diskusprolaps,nakke prolaps,lumbal prolaps
region/cervical|cervical,nakke,hals,cervikalt
region/thoracic|thorakal,brystrygg,thoracic,brystryggsmerter
region/lumbar|lumbal,korsrygg,lumbar,lumbalt
region/shoulder|skulder,shoulder
region/elbow|albue,elbow
region/wrist|håndledd,wrist,karpaltunnel,carpaltunnel
region/hip|hofte,hip,bekken
region/knee|kne,knee
region/ankle|ankel,ankle
region/foot|fot,foot,forfot
region/tmj|kjeve,tmj,temporomandibulær,kjeveleddet,tmd
region/vestibular|vestibulær,vestibular,balanse,vestibularisnevritt
region/scapular|skulderblad,scapula,scapular,mellom skulderbladene,interskapulær
technique/manipulation|manipulasjon,manipulation,justering,adjustment,leddmanipulasjon
technique/mobilization|mobilisering,mobilization,leddmobilisering
technique/rehabilitation|rehabilitering,rehabilitation,trening,øvelser,rehab
technique/dry-needling|tørrnåling,dry needling,nålebehandling,akupunktur
technique/bppv-maneuver|epley,bppv manøver,semont,dix-hallpike,repositioning
technique/exercise-prescription|øvelsesprogram,exercise prescription,hjemmeøvelser,treningsprogram
technique/traction|traksjon,traction,cervical traksjon
technique/soft-tissue|bløtvevsbehandling,soft tissue,myofascial,bløtvev
technique/shockwave|trykkbølge,shockwave,eswt,radial shockwave,trykkbølgebehandling
technique/iastm|iastm,graston,instrumentassistert,instrument assisted
technique/red-light|rødlys,red light,fotobiomodulasjon,pbm,lllt,lavnivå laser
source/clinical-experience|klinisk erfaring,clinical experience
