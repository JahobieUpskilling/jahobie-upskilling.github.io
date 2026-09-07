/**
 * ABC Tutoring — tutor roster.
 *
 * This is the single source of truth for the site. Dana can edit this file to
 * add a tutor, change an hourly rate, or adjust weekly availability without
 * touching any other code.
 *
 * availability.days  — weekday numbers a tutor works (0 = Sunday … 6 = Saturday)
 * availability.times — 24-hour start times offered on those days
 * Sessions are one hour long, and the schedule below repeats every week.
 */
window.ABC_TUTORS = [
  {
    id: 'maya-ellison',
    name: 'Maya Ellison',
    photo: 'assets/tutors/maya-ellison.svg',
    tagline: 'Middle school math, minus the panic',
    subjects: ['Math', 'Pre-Algebra', 'Algebra I'],
    gradeMin: 4,
    gradeMax: 9,
    rate: 45,
    yearsExperience: 7,
    languages: ['English'],
    bio:
      'Maya taught 7th and 8th grade math in the district for six years before joining ABC Tutoring. She is at her best with the student who says "I am just bad at math" — she rebuilds the missing pieces underneath the current homework so the current homework stops being a fight.',
    approach: [
      'Starts with a short check of what the student already knows, so no time is spent on skills they have.',
      'Works through the student\'s own homework and class notes rather than a separate workbook.',
      'Sends Dana a two-line recap after each session that gets passed on to you.'
    ],
    credentials: ['B.S. Mathematics, state teaching license', 'Background checked, 2025'],
    availability: { days: [1, 3, 4], times: ['15:30', '16:30', '17:30', '18:30'] }
  },
  {
    id: 'daniel-okafor',
    name: 'Daniel Okafor',
    photo: 'assets/tutors/daniel-okafor.svg',
    tagline: 'Science that connects to the lab report due Friday',
    subjects: ['Science', 'Biology', 'Chemistry'],
    gradeMin: 6,
    gradeMax: 12,
    rate: 50,
    yearsExperience: 9,
    languages: ['English'],
    bio:
      'Daniel is a former high school science teacher who still writes his own practice problems. Families come to him for middle school general science and stay through Biology and Chemistry. He is patient with students who need a concept explained three different ways.',
    approach: [
      'Uses drawings and everyday examples first, vocabulary second.',
      'Builds a short review sheet with the student during the session that they keep.',
      'Happy to work around a lab report or test date if you mention it when booking.'
    ],
    credentials: ['M.Ed. Science Education', 'Background checked, 2025'],
    availability: { days: [2, 4, 6], times: ['16:00', '17:00', '18:00'] }
  },
  {
    id: 'priya-raman',
    name: 'Priya Raman',
    photo: 'assets/tutors/priya-raman.svg',
    tagline: 'Reading comprehension and writing that clicks',
    subjects: ['Reading', 'Writing', 'English'],
    gradeMin: 2,
    gradeMax: 8,
    rate: 40,
    yearsExperience: 5,
    languages: ['English', 'Tamil'],
    bio:
      'Priya works with readers who can decode the words but lose the meaning, and with writers who freeze at a blank page. She is especially good with the middle schooler facing their first real essay assignments.',
    approach: [
      'Reads alongside the student and models the questions strong readers ask themselves.',
      'Breaks essays into small, finishable steps instead of one large assignment.',
      'Keeps a running list of the student\'s wins to build confidence.'
    ],
    credentials: ['B.A. English, literacy specialist training', 'Background checked, 2025'],
    availability: { days: [1, 2, 4], times: ['15:00', '16:00', '17:00', '19:00'] }
  },
  {
    id: 'grace-whitfield',
    name: 'Grace Whitfield',
    photo: 'assets/tutors/grace-whitfield.svg',
    tagline: 'Warm, unhurried help for our youngest students',
    subjects: ['Reading', 'Math', 'Phonics'],
    gradeMin: 0,
    gradeMax: 5,
    rate: 38,
    yearsExperience: 12,
    languages: ['English'],
    bio:
      'Grace spent twelve years in elementary classrooms, most of them in second grade. She keeps sessions playful and short-cycled so younger students stay with her the whole hour, and she is unflappable about the occasional rough day.',
    approach: [
      'Alternates between game-style practice and focused work every few minutes.',
      'Covers phonics gaps directly rather than working around them.',
      'Gives parents one small thing to practice during the week — never a packet.'
    ],
    credentials: ['B.S. Elementary Education, K-6 license', 'Background checked, 2025'],
    availability: { days: [1, 3, 5], times: ['15:00', '16:00', '17:00'] }
  },
  {
    id: 'sam-torres',
    name: 'Sam Torres',
    photo: 'assets/tutors/sam-torres.svg',
    tagline: 'Spanish, plus the organization skills nobody teaches',
    subjects: ['Spanish', 'Study Skills'],
    gradeMin: 4,
    gradeMax: 12,
    rate: 42,
    yearsExperience: 6,
    languages: ['English', 'Spanish'],
    bio:
      'Sam grew up bilingual and teaches Spanish the way he learned it — talking. He also works with students whose grades are slipping because of missing assignments rather than missing understanding, which is more common in middle school than most parents expect.',
    approach: [
      'Spends most of a Spanish session speaking, not conjugating on paper.',
      'For study skills, sets up a planner system with the student and checks it each week.',
      'Keeps the tone low-pressure for students who are embarrassed about falling behind.'
    ],
    credentials: ['B.A. Spanish, bilingual education certificate', 'Background checked, 2025'],
    availability: { days: [2, 3, 5], times: ['16:30', '17:30', '18:30'] }
  },
  {
    id: 'aisha-bello',
    name: 'Aisha Bello',
    photo: 'assets/tutors/aisha-bello.svg',
    tagline: 'High school math and physics, taught for understanding',
    subjects: ['Math', 'Algebra II', 'Precalculus', 'Physics'],
    gradeMin: 8,
    gradeMax: 12,
    rate: 55,
    yearsExperience: 8,
    languages: ['English'],
    bio:
      'Aisha is an engineer who tutors evenings because she likes the moment a student stops memorizing steps and starts seeing why they work. She takes on the courses families find hardest to staff — Algebra II, Precalculus, and first-year Physics.',
    approach: [
      'Asks the student to explain their reasoning out loud, then fixes the reasoning rather than the answer.',
      'Works ahead of the class by a lesson or two when a student is ready for it.',
      'Straightforward with parents about what a student needs and how long it will take.'
    ],
    credentials: ['B.Eng. Mechanical Engineering', 'Background checked, 2025'],
    availability: { days: [1, 2, 4, 6], times: ['17:00', '18:00', '19:00'] }
  }
];

/** Grade options used by the filters and the booking form. */
window.ABC_GRADES = [
  { value: 0, label: 'Kindergarten', short: 'K' },
  { value: 1, label: '1st grade', short: '1' },
  { value: 2, label: '2nd grade', short: '2' },
  { value: 3, label: '3rd grade', short: '3' },
  { value: 4, label: '4th grade', short: '4' },
  { value: 5, label: '5th grade', short: '5' },
  { value: 6, label: '6th grade', short: '6' },
  { value: 7, label: '7th grade', short: '7' },
  { value: 8, label: '8th grade', short: '8' },
  { value: 9, label: '9th grade', short: '9' },
  { value: 10, label: '10th grade', short: '10' },
  { value: 11, label: '11th grade', short: '11' },
  { value: 12, label: '12th grade', short: '12' }
];
