import { COURSES, type CourseId } from '../game/CourseCatalog';
import { SINGLE_GOALS, type SingleGoal } from '../game/SingleRecords';
import { t } from '../settings/i18n';

/** Shared compact goal badges for map cards and the single-run result. */
export function singleGoals(map:CourseId,earned:readonly SingleGoal[],fresh:readonly SingleGoal[]=[]):HTMLElement {
  const row=document.createElement('div');row.className='single-goals';row.setAttribute('role','group');row.setAttribute('aria-label',t('singleGoals'));
  for(const goal of SINGLE_GOALS){
    const achieved=earned.includes(goal),isNew=fresh.includes(goal);
    const label=goal==='finish'?t('singleGoalFinish'):goal==='noFalls'?t('singleGoalNoFalls'):t('singleGoalTime').replace('{seconds}',String(COURSES[map].goalSeconds));
    const badge=document.createElement('span');badge.className='single-goal';badge.setAttribute('data-goal',goal);badge.setAttribute('data-earned',String(achieved));badge.setAttribute('data-new',String(isNew));
    const description=`${label} · ${t(achieved?'singleGoalEarned':'singleGoalPending')}${isNew?' · '+t('singleGoalNew'):''}`;
    badge.setAttribute('aria-label',description);badge.title=description;
    const paw=document.createElement('span');paw.className='race-course-paw single-goal-paw';paw.setAttribute('aria-hidden','true');
    for(let toe=0;toe<4;toe++)paw.append(document.createElement('i'));
    const name=document.createElement('span');name.textContent=label;badge.append(paw,name);
    if(isNew){const note=document.createElement('strong');note.className='single-goal-new';note.textContent=t('singleGoalNew');badge.append(note);}
    row.append(badge);
  }
  return row;
}
