-- Owner-reviewed publication and schedule changes. No access is assigned.
alter table coordinator_approvals drop constraint coordinator_approvals_kind_check;
alter table coordinator_approvals add constraint coordinator_approvals_kind_check check(kind in ('transfer','cancel-event','content','tryout-change','program-change'));
