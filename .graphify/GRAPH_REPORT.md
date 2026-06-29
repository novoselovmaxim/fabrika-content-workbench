# Graph Report - .  (2026-06-19)

## Corpus Check
- 61 files · ~398,734 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 229 nodes · 382 edges · 11 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 174 · imports: 97 · imports_from: 90 · calls: 14 · method: 7


## Input Scope
- Requested: auto
- Resolved: all (source: default-auto)
- Included files: 61 · Candidates: recursive
- Excluded: 0 untracked · 0 ignored · 0 sensitive · 0 missing committed
## God Nodes (most connected - your core abstractions)
1. `db` - 17 edges
2. `api` - 15 edges
3. `MetaInstagramService` - 8 edges
4. `generate()` - 7 edges
5. `rubrics` - 6 edges
6. `contentTypes` - 6 edges
7. `getModelForTask()` - 6 edges
8. `topics` - 5 edges
9. `postItems` - 5 edges
10. `projects` - 4 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (20): ChatPanelProps, CONTENT_TYPE_TO_TEMPLATE, GeneratePanelProps, api, statusLabels, DEFAULT_DESIGN_SYSTEM, DesignSystem, statusLabels (+12 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (28): contentTypesRouter, draftsRouter, pipelineRouter, platformsRouter, postsRouter, rubricsRouter, settingsRouter, strategyRouter (+20 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (31): chatRouter, addDays(), buildWeekPlanPrompt(), formatDate(), generateRouter, projectsRouter, AiProvider, callAnthropic() (+23 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (8): statusColors, statuses, statusLabels, Step, GEN_PROMPTS, statusColors, statuses, statusLabels

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (7): instagramRouter, InstagramAccountInsights, InstagramConfig, InstagramMedia, InstagramMediaInsights, instagramService, MetaInstagramService

### Community 5 - "Community 5"
Cohesion: 0.15
Nodes (7): Answer, BrandInterviewProps, QUESTIONS, PLATFORM_COLORS, PLATFORM_OPTIONS, STEPS, STYLE_OPTIONS

### Community 6 - "Community 6"
Cohesion: 0.20
Nodes (7): assetsRouter, __dirname, storage, upload, uploadDir, generateImage(), assets

### Community 7 - "Community 7"
Cohesion: 0.24
Nodes (8): addPost(), contentTypeData, ct(), db, postData, rb(), rubricData, sqlite

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (6): defaultPipeline, nodeTypes, PipelineNodeProps, PipelineViewProps, stageColors, stageLabels

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (6): convertFile(), __dirname, knowledgeRouter, turndown, upload, uploadDir

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (6): CalendarPage(), dayNames, getMonthDays(), monthNames, statusColors, statusLabels

## Knowledge Gaps
- **81 isolated node(s):** `globalNavItems`, `projectNavItems`, `Answer`, `BrandInterviewProps`, `QUESTIONS` (+76 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `api` connect `Community 0` to `Community 10`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `db` connect `Community 1` to `Community 6`, `Community 2`, `Community 9`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `globalNavItems`, `projectNavItems`, `Answer` to the rest of the system?**
  _81 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05697278911564626 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.12051282051282051 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._