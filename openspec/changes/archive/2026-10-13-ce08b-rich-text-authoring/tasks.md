## 1. Authoring contract

- [x] 1.1 Update architecture section 17 and the CE8B roadmap state before code to describe H1–H4, rules, plain code, independent link switches and the additional selection menu; verify agreement with CE8A's format and this delta without changing publication, recursion or safety invariants.

## 2. Shared editor schema and serialization

- [x] 2.1 Extend rich-text-extensions.ts for H4, rules and attribute-free plain code, with only matching pinned Tiptap dependencies if necessary; verify existing and expanded documents survive editor loading and output passes the shared validator, including empty/multiline code, all link combinations, ordinary paste/input rules, unsafe URLs and forbidden code marks/attributes.
- [x] 2.2 Implement omission of absent optional link attributes at the editor serialization boundary without hiding invalid non-null values, and retain stable editor/history state across controlled updates; verify opening existing documents does not dirty the form and undo/redo preserves expanded content in focused editor tests.

## 3. Formatting and links

- [x] 3.1 Add H4, a plain Code block toggle and Insert horizontal rule to the fixed toolbar, with token-based editor presentation, accurate active states, applicable shortcut hints and disabled unsupported code formatting; verify keyboard roving focus, Alt+F10, Escape, creation/change/removal and existing H1–H3 behavior in toolbar/editor tests.
- [x] 3.2 Extend LinkPopover with independent labelled Open in a new tab and nofollow switches, selection retention and correct prefill/clear/apply/remove behavior; verify all four stored combinations, selected text, cursor inside a link, empty selection, rejected URLs, cancellation and restored focus in component tests.
- [x] 3.3 Add the compact selection bubble menu sharing Bold, Italic, Strike, inline Code and Link actions with the fixed toolbar; verify visibility, active states, selection retention, no focus stealing, Escape dismissal and absence for read-only, hidden, unfocused and code-block selections in component tests.

## 4. Browser and product verification

- [x] 4.1 Extend focused admin browser coverage for creating/changing/removing new features, link options after save/reload, undo/redo, normal paste, keyboard-only toolbar/popover/menu use and viewer non-editability; run the suite and focused axe checks and record commands/results.
- [x] 4.2 Verify recursive model/block rich-text leaves across list moves, disclosures and Content/Settings tabs retain content, history and selection where applicable; include loaded old/new documents without dirty state and local preservation on failed save/conflict in component/browser coverage, then run the focused tests.
- [x] 4.3 Exercise actual API save/read/publish/export with expanded documents and build the common Astro output from the resulting export; assert H4/rules, escaped code with exact whitespace and all four safe link outcomes, plus unchanged published content after a later draft edit. Record real integration evidence separately from browser request mocks and retain shared cross-runtime validation coverage.

## 5. Documentation and completion

- [x] 5.1 Update authoring guidance, reference/starter examples and compatibility/consumer upgrade instructions; verify common-renderer use and applicable starter/reference parity checks, replace the interim admin limitation only after preservation passes, and document coordinated upgrades/rollback without migration or automatic rewrites.
- [x] 5.2 After focused checks pass, run root pnpm typecheck, pnpm lint, pnpm format:check and pnpm exec openspec validate ce08b-rich-text-authoring --type change --strict; resolve failures and record verification evidence and the CE8B roadmap outcome, then review the diff for CE8B scope.

After all implementation tasks pass, carry out the user's authorized finalization: synchronize verified CE8A deltas first, then CE8B; verify main-spec matches, archive completed changes with the archive skill, and commit the complete scoped result in the current branch. Finalization follows implementation and is not evidence that an implementation task passed.
