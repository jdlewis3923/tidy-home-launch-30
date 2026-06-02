// Tidy — Training quiz questions (hardcoded, Phase 3).
// Pass threshold: 8 of 10 correct. Server-side scoring is authoritative.

export type Question = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number; // index into options
};

export const PASS_THRESHOLD = 8;

export const QUESTIONS: Question[] = [
  {
    id: 'q1_arrival',
    prompt: 'A customer is not home when you arrive on time. What do you do first?',
    options: [
      'Leave immediately and mark the visit canceled',
      'Wait 5 minutes, then contact Tidy support before doing anything else',
      'Walk in if a side door is unlocked',
      'Reschedule yourself directly with the customer',
    ],
    correctIndex: 1,
  },
  {
    id: 'q2_photos',
    prompt: 'How many before/after photos are required per visit at Tier 1?',
    options: ['None — only if requested', '3 photos', '6 photos (before + after of key areas)', '20+ photos'],
    correctIndex: 2,
  },
  {
    id: 'q3_damage',
    prompt: 'You accidentally damage a customer\'s property. What is the first thing you should do?',
    options: [
      'Hide it and hope no one notices',
      'Report it to Tidy immediately with a photo before leaving the site',
      'Offer to pay the customer cash on the spot',
      'Wait until the customer notices and complains',
    ],
    correctIndex: 1,
  },
  {
    id: 'q4_tips',
    prompt: 'A customer offers you a cash tip. Can you accept it?',
    options: [
      'No — never accept anything from customers',
      'Yes — and you do not need to report it',
      'Yes — accept it, but report all tips through the Tidy pro app for tax purposes',
      'Only if it is over $20',
    ],
    correctIndex: 2,
  },
  {
    id: 'q5_uniform',
    prompt: 'Which of these is acceptable jobsite attire?',
    options: [
      'Tank top and flip-flops',
      'Clean closed-toe shoes, clean pants/shorts, clean shirt — no offensive graphics',
      'Whatever is most comfortable for that day',
      'Pajamas if you are tired',
    ],
    correctIndex: 1,
  },
  {
    id: 'q6_late',
    prompt: 'You are running 15+ minutes late to a visit. What do you do?',
    options: [
      'Just show up and apologize in person',
      'Notify Tidy support and the customer ASAP through the app',
      'Cancel the visit and let Tidy reschedule',
      'Speed to make up time',
    ],
    correctIndex: 1,
  },
  {
    id: 'q7_payment',
    prompt: 'Where does your payment come from?',
    options: [
      'Cash from the customer at the end of each visit',
      'Direct deposit from Tidy to your Stripe Express account on a weekly schedule',
      'Mailed paper checks every 2 weeks',
      'You invoice the customer directly',
    ],
    correctIndex: 1,
  },
  {
    id: 'q8_pets',
    prompt: 'A customer has a dog that seems aggressive. What do you do?',
    options: [
      'Proceed anyway — it is not your problem',
      'Ask the customer to secure the pet; if they refuse, leave and contact Tidy support',
      'Try to befriend the dog with food',
      'Bring pepper spray next time',
    ],
    correctIndex: 1,
  },
  {
    id: 'q9_rating',
    prompt: 'What is the minimum 30-day average customer rating to stay active?',
    options: ['3.0', '4.0', '4.5', '4.8'],
    correctIndex: 2,
  },
  {
    id: 'q10_offboard',
    prompt: 'A customer asks for your personal number to "book directly" and skip Tidy. What do you do?',
    options: [
      'Give them your number — more money for you',
      'Politely decline and explain that all bookings must go through Tidy. Report the request in the app.',
      'Give them a fake number',
      'Quit Tidy and go independent',
    ],
    correctIndex: 1,
  },
];

/** Server-side scoring helper. Accepts { [questionId]: answerIndex }. */
export function scoreAnswers(answers: Record<string, number>): { score: number; total: number; passed: boolean } {
  let score = 0;
  for (const q of QUESTIONS) {
    if (answers[q.id] === q.correctIndex) score += 1;
  }
  return { score, total: QUESTIONS.length, passed: score >= PASS_THRESHOLD };
}
