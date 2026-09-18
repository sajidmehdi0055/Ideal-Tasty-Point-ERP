# Inventory S-01 implementation and traceability

Branch: feat/inv-s01-item-master. Base: 663662e. Authority: current explicit S-01 implementation instruction; ADR-0001..0006; INV-11/12; approved AC-01/02/11 and applicable PC-09. Older documentation-only phase statements are historical, not a restriction on this explicit implementation authorization.

## Bounded task and contracts

Allowed code: backend/ only; root .gitignore and README for tooling/status; this record and CURRENT-HANDOFF for evidence. Preserve pre-existing package.json/ADR-0006 intent. No requirements or architecture policy changed. Frontend, Redis, authentication/session issuance, stock operations and all future modules are excluded.

Manager/root implements domain, service, validation, authorization, API, foundation and local setup. s01_persistence implements migrations, persistence/audit and PostgreSQL integration tests. s01_tests implements unit/API tests. Independent final security/code reviewer: baseline_review (no implementation). Independent requirements and QA reviewers will validate traceability and evidence before completion.

Domain defines the four item types and input constraints. Application service validates input and permissions before calling the ItemRepository port. PgItemRepository owns transactional SQL and append-only audit writes. API delegates to service; AuthContextProvider is injected at the composition boundary. No client-controlled header becomes trusted authentication. This implements O-03 without selecting future authentication mechanics.

## Requirement coverage

| Requirement | Implementation / planned verification |
|---|---|
| ADR-0002 S-01 create/edit/ID | POST and PATCH only; UUID internal ID plus generated business code; API returns persisted records |
| ADR-0003 / AC-01 mandatory fields | Zod strict inputs plus PostgreSQL NOT NULL/nonblank constraints; invalid create/patch tests |
| ADR-0003 / AC-02 exactly one primary type | Scalar enum / SQL CHECK with all four approved values; array/invalid-type tests |
| ADR-0003 brand / Base UOM / active | Required text with explicit Generic / No Brand value; active defaults true; no brand workflow or active mutation API |
| INV-11 / PC-09 | Only Owner and Manager; backend/service checks; absent context and other roles denied; direct service tests |
| O-01 global unique code | UNIQUE(item_code) independent of branch; multi-branch concurrent create tests |
| O-02 sequence/no manual edits | PostgreSQL nextval INSERT trigger; minimum six digits; strict request unknown-field rejection; immutable code trigger; no COUNT/MAX generator |
| O-03 injected AuthContext | Trusted provider; default deny; spoofed client context-header tests; no auth/session infrastructure |
| AC-11 immutable audit | Item and before/after audit in one transaction; audit failure rollback; update/delete/truncate rejection; restricted runtime DB role |
| branch_id awareness | Trusted context supplies branch; update WHERE id AND branch_id; matching audit branch; cross-branch denial tests |
| INV-05 / AC-12 scoped simplicity | One request per create/edit; system fields generated, no repeated manual code/branch entry; no UI usability sign-off claimed |

Out-of-scope AC-03 issue behavior and AC-04..10 stock/archive/merge features are not marked implemented. Current scope includes only brand value preservation and historical audit safety, not those future workflows.

## Technical choices and limits

- Patch edits only supplied approved fields and locks the row, preventing concurrent disjoint-field updates from overwriting each other. No new business approval or edit permission is inferred.
- Database sequence is global on the authoritative PostgreSQL instance. Offline multi-writer code allocation is not implemented or claimed; offline creation is not authorized for S-01.
- Use UUID for internal identity and text branch/user references, leaving future identity/branch schemas unbound. Branch isolation enforced in repository/API, not claimed as a completed ERP-wide RLS scheme.
- Runtime credentials must be a dedicated non-owner role with column grants; migration-owner/administrator access is separate. No public authenticated deployment is authorized by injected test contexts.
- Migration adds new objects only. No existing business database is migrated in this task. Destructive down migration is refused; forward correction required.

Detailed commands, API format, dependency rationale and test prerequisites: ../../backend/README.md. Actual execution/review results belong in CURRENT-HANDOFF.md; tests are not assumed passed here.
