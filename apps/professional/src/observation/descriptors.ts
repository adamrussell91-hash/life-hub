/**
 * The 37 Proficient Teacher (career stage) descriptors from the Australian Professional Standards for
 * Teachers. Public AITSL text, kept in code.
 */
export interface ProficientDescriptor {
  code: string;
  standard: number;
  /** Focus area name. */
  focus: string;
  /** The Proficient descriptor wording. */
  text: string;
}

export const STANDARD_NAMES: Record<number, string> = {
  1: 'Know students and how they learn',
  2: 'Know the content and how to teach it',
  3: 'Plan for and implement effective teaching and learning',
  4: 'Create and maintain supportive and safe learning environments',
  5: 'Assess, provide feedback and report on student learning',
  6: 'Engage in professional learning',
  7: 'Engage professionally with colleagues, parents/carers and the community'
};

const RAW: Array<[string, string, string]> = [
  ['1.1.2', 'Physical, social and intellectual development and characteristics of students', 'Use teaching strategies based on knowledge of students’ physical, social and intellectual development and characteristics to improve student learning.'],
  ['1.2.2', 'Understand how students learn', 'Structure teaching programs using research and collegial advice about how students learn.'],
  ['1.3.2', 'Students with diverse linguistic, cultural, religious and socioeconomic backgrounds', 'Design and implement teaching strategies that are inclusive of students from diverse linguistic, cultural, religious and socioeconomic backgrounds.'],
  ['1.4.2', 'Strategies for teaching Aboriginal and Torres Strait Islander students', 'Design and implement teaching activities that incorporate the effective use of knowledge of the histories, cultures and languages of Aboriginal and Torres Strait Islander students.'],
  ['1.5.2', 'Differentiate teaching to meet the specific learning needs of students across the full range of abilities', 'Develop teaching activities that incorporate differentiated strategies to meet the specific learning needs of students across the full range of abilities.'],
  ['1.6.2', 'Strategies to support full participation of students with disability', 'Design and implement teaching activities that support the participation and learning of students with disability and address relevant policy and legislative requirements.'],
  ['2.1.2', 'Content and teaching strategies of the teaching area', 'Apply knowledge of the content and teaching strategies of the teaching area to develop engaging teaching activities.'],
  ['2.2.2', 'Content selection and organisation', 'Organise content into an effective learning and teaching sequence.'],
  ['2.3.2', 'Curriculum, assessment and reporting', 'Use curriculum, assessment and reporting knowledge to design learning sequences and lesson plans.'],
  ['2.4.2', 'Understand and respect Aboriginal and Torres Strait Islander people to promote reconciliation between Indigenous and non-Indigenous Australians', 'Provide opportunities for students to develop understanding of and respect for Aboriginal and Torres Strait Islander histories, cultures and languages.'],
  ['2.5.2', 'Literacy and numeracy strategies', 'Apply knowledge and understanding of effective teaching strategies to support students’ literacy and numeracy achievement.'],
  ['2.6.2', 'Information and Communication Technology (ICT)', 'Implement teaching strategies for using ICT to expand curriculum learning opportunities for students.'],
  ['3.1.2', 'Establish challenging learning goals', 'Set learning goals that provide achievable challenges for students of varying abilities and characteristics.'],
  ['3.2.2', 'Plan, structure and sequence learning programs', 'Plan lesson sequences using knowledge of student learning, content and effective teaching strategies.'],
  ['3.3.2', 'Use teaching strategies', 'Include a range of teaching strategies.'],
  ['3.4.2', 'Select and use resources', 'Select and/or create and use a range of resources, including ICT, to engage students in their learning.'],
  ['3.5.2', 'Use effective classroom communication', 'Use effective verbal and non-verbal communication strategies to support student understanding, engagement and achievement.'],
  ['3.6.2', 'Evaluate and improve teaching programs', 'Work with colleagues to review current teaching and learning programs using student feedback, student assessment data, knowledge of curriculum and workplace practices.'],
  ['3.7.2', 'Engage parents/carers in the educative process', 'Plan for appropriate and contextually relevant opportunities for parents/carers to be involved in their children’s learning.'],
  ['4.1.2', 'Support student participation', 'Establish and implement inclusive and positive interactions to engage and support all students in classroom activities.'],
  ['4.2.2', 'Manage classroom activities', 'Establish and maintain orderly and workable routines to create an environment where student time is spent on learning tasks.'],
  ['4.3.2', 'Manage challenging behaviour', 'Manage challenging behaviour by establishing and negotiating clear expectations with students and address discipline issues promptly, fairly and respectfully.'],
  ['4.4.2', 'Maintain student safety', 'Ensure students’ wellbeing and safety within a learning environment by implementing and complying with relevant policies and procedures.'],
  ['4.5.2', 'Use ICT safely, responsibly and ethically', 'Incorporate strategies to promote the safe, responsible and ethical use of ICT in learning and teaching.'],
  ['5.1.2', 'Assess student learning', 'Develop, select and use informal and formal, diagnostic, formative and summative assessment strategies to assess student learning.'],
  ['5.2.2', 'Provide feedback to students on their learning', 'Provide timely and effective feedback to students about their achievement relative to learning goals.'],
  ['5.3.2', 'Make consistent and comparable judgements', 'Understand and participate in assessment moderation activities to support consistent and comparable judgements of student learning.'],
  ['5.4.2', 'Interpret student data', 'Use student assessment data to analyse and evaluate student understanding of subject/content, identify interventions and modify teaching practice.'],
  ['5.5.2', 'Report on student achievement', 'Report on student achievement, making use of accurate and reliable records.'],
  ['6.1.2', 'Identify and plan professional learning needs', 'Use the Australian Professional Standards for Teachers and advice from colleagues to identify and plan professional learning needs.'],
  ['6.2.2', 'Engage in professional learning and improve practice', 'Participate in learning to update knowledge and practice, targeted to professional needs and school and/or system priorities.'],
  ['6.3.2', 'Engage with colleagues and improve practice', 'Contribute to collegial discussions and apply constructive feedback from colleagues to improve professional knowledge and practice.'],
  ['6.4.2', 'Apply professional learning and improve student learning', 'Undertake professional learning programs designed to address identified student learning needs.'],
  ['7.1.2', 'Meet professional ethics and responsibilities', 'Meet codes of ethics and conduct established by regulatory authorities, systems and schools.'],
  ['7.2.2', 'Comply with legislative, administrative and organisational requirements', 'Understand the relevant legislative, administrative and organisational policies and processes required for teachers according to school stage.'],
  ['7.3.2', 'Engage with the parent/carer community', 'Understand strategies for working effectively, sensitively and confidentially with parents/carers.'],
  ['7.4.2', 'Engage with professional teaching networks and broader communities', 'Participate in professional and community networks and forums to broaden knowledge and improve practice.']
];

export const PROFICIENT_DESCRIPTORS: ProficientDescriptor[] = RAW.map(([code, focus, text]) => {
  const standard = Number(code[0]);
  return { code, standard, focus, text };
});

export function descriptorByCode(code: string): ProficientDescriptor | undefined {
  return PROFICIENT_DESCRIPTORS.find((d) => d.code === code);
}
