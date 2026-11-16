/**
 * What to look for, per Proficient descriptor, from NESA’s Proficient Teacher Evidence Guide (February 2024),
 * Section 4. `look_fors` are the guide’s Observation statements, one per sentence, each with a short label to
 * use as a quick key; `proficient` are its “A Proficient Teacher …” examples. Public NESA guidance, lightly
 * shortened for K-12 (no personal content). Generated from the guide’s text; edit by hand if NESA revises it.
 */
export interface GuideLookFor {
  /** A few words, fit for a quick key. */
  short: string;
  /** The guide’s sentence. */
  full: string;
}

export interface DescriptorGuide {
  /** Things you can see in a lesson. Empty when the guide says the descriptor is not suitable for observation. */
  look_fors: GuideLookFor[];
  /** What a Proficient teacher does, from the guide’s worked examples. */
  proficient: string[];
}

export const DESCRIPTOR_GUIDE: Record<string, DescriptorGuide> = {
  '1.1.2': {
    look_fors: [
      { short: "Instructions pitched to each stage", full: "Modifies task instructions and/or language to suit the developmental stages and characteristics of all students" },
      { short: "Lesson adjusted to student needs", full: "Structures and adjusts lesson content/learning experience where required to meet identified physical, social and intellectual development and characteristics" }
    ],
    proficient: [
      "Is familiar with a range of teaching strategies to support students’ physical social and intellectual development and target different areas of student learning",
      "Seeks background information from colleagues about students to identify students’ physical, social and intellectual development and characteristics",
      "Tracks student learning progress, using observation and/or formative and summative assessment data, to evaluate the impact of teaching strategies to address identified physical, social and intellectual development and characteristics and improve student learning",
      "Participates in planning meetings with colleagues about the physical, social and intellectual development and characteristics of individual students and their learning needs to inform future planning, teaching decisions and strategies",
      "Selects from a range of teaching strategies to support students’ physical, social and intellectual development",
      "Reflects on and evaluates the impact of teaching practices to address students’ physical, social and intellectual development and characteristics and improve student learning"
    ]
  },
  '1.2.2': {
    look_fors: [
      { short: "Evidence-based practice in action", full: "Implements a variety of evidence-based teaching practices about how students learn (including but not limited to connected lesson delivery, inclusive or differentiated lessons, higher-order thinking skills or appropriate practical activities)" },
      { short: "Explicit teaching, research-informed", full: "Uses explicit teaching strategies in the classroom that reflect the application of a research-based understanding of how students learn" }
    ],
    proficient: [
      "Undertakes personal research and records discussions and/or feedback from colleagues mentors and/or the Accreditation Supervisor to build professional knowledge about how students learn",
      "Applies research-based knowledge and colleague’s advice about how students learn to structure lessons/learning experiences, day plans and/or teaching and learning programs",
      "Seeks feedback and reflects on effectiveness of the application of professional knowledge about how students learn to inform teaching practice and future planning",
      "Undertakes personal research about how students learn",
      "Engages with colleagues for advice and feedback to broaden understanding about how students learn to identify student learning needs",
      "Applies and evaluates the impact of a wide range of evidence-based teaching practices to meet identified student learning needs"
    ]
  },
  '1.3.2': {
    look_fors: [
      { short: "Resources for diverse backgrounds", full: "Uses language and designs and implements resources to address learning strengths and needs of students from diverse linguistic, cultural, religious and socio-economic backgrounds" },
      { short: "Strategies for diverse learners", full: "Structures lesson content delivery using teaching strategies specific to the learning strengths and needs of students from diverse linguistic, cultural, religious and socio-economic backgrounds" }
    ],
    proficient: [
      "Identifies the learning strengths and needs of students from a range of linguistic, cultural, religious and socio-economic backgrounds",
      "Develops and uses evidence-based teaching strategies responsive to the learning strengths and needs of students’’ linguistic, cultural, religious and socio-economic backgrounds",
      "Uses knowledge of diverse linguistic, cultural, religious and socio-economic backgrounds to evaluate the impact of teaching strategies implemented to respond to learning needs of students",
      "Analyses documents, such as enrolment data and personalised plans to design teaching strategies responsive to learning strengths and needs of students from diverse linguistic, cultural, religious and socio-economic backgrounds",
      "Undertakes lesson observation/s with colleagues to inform feedback discussion/s on the implementation of selected teaching strategies to meet the learning strengths and needs of students from diverse linguistic, cultural and religious socioeconomic backgrounds",
      "Makes notes and reflects on feedback from colleagues to inform future planning and modifications to teaching strategies to meet the learning strengths and needs of students from diverse linguistic, cultural and religious socioeconomic backgrounds"
    ]
  },
  '1.4.2': {
    look_fors: [
      { short: "Culturally responsive materials", full: "Uses a range of evidence-based teaching strategies and/or teacher-developed learning materials that are responsive to the local community and cultural setting, linguistic background and histories of Aboriginal and/or Torres Strait Islander students" },
      { short: "Strategies for Aboriginal students", full: "Uses a range of evidence-based differentiated teaching strategies based on knowledge of local community and cultural settings, linguistic background and histories to support the learning growth and achievement of Aboriginal and/or Torres Strait Islander students" }
    ],
    proficient: [
      "Seeks background information relating to the local community and cultural setting, linguistic background and histories of Aboriginal and/or Torres Strait Islander students",
      "Uses background information to select evidence-based teaching strategies that are responsive to the individual learning strengths and needs of Aboriginal and/or Torres Strait Islander students",
      "Evaluates the impact of teaching strategies implemented that are responsive to the local community and cultural setting, linguistic background and histories of Aboriginal and/or Torres Strait Islander students to address their learning strengths and needs",
      "Uses knowledge of NSW curriculum to inform the design of teaching programs that are responsive to the local community and cultural setting, linguistic background and histories of Aboriginal and/or Torres Strait Islander students and their learning strengths and needs",
      "Uses a range of current, research-based teaching strategies, guided by advice from Elders and/or community representatives, to implement strategies that are responsive to the learning strengths and needs of Aboriginal and/or Torres Strait Islander students",
      "Evaluates the impact of teaching strategies implemented to address the learning strengths and needs of Aboriginal and/or Torres Strait Islander students and support learning growth and achievement"
    ]
  },
  '1.5.2': {
    look_fors: [
      { short: "Differentiated activities", full: "Uses a range of differentiated teaching activities and instructional approaches to support identified learning strengths and meet the specific learning needs of students across the full range of abilities" },
      { short: "Equitable chances to show learning", full: "Provides students with equitable, differentiated opportunities to apply knowledge and skills, express their understanding or explain a skill they have learned" }
    ],
    proficient: [
      "Collaborates with colleagues to identify specific student learning needs and plan for differentiated content, lesson delivery and learning activities",
      "Sequences lesson pace and organises teaching activities to impact student learning progress and achievement across the full range of abilities",
      "Works with specialist colleagues (including special education teachers, gifted and talented teachers, early intervention workers, and EAL/D teachers) to develop and implement a variety of revised instructional approaches and differentiated teaching strategies",
      "Links NSW curriculum/ELYF with specific differentiated teaching strategies and practices to meet the learning strengths and needs of students across the full range of abilities",
      "Evaluates the impact of differentiated teaching strategies on specific learning strengths and needs of students across the full range of abilities to inform future planning"
    ]
  },
  '1.6.2': {
    look_fors: [
      { short: "Routines support students with disability", full: "Uses clearly established routines to support all students in the classroom to develop conduct and behaviours that support the participation and learning of students with disability" },
      { short: "Adjustments for students with disability", full: "Ensures that teaching activities are suited to the full range of student learning strengths and needs in the classroom and makes adjustments where required to support the learning and participation of students with disability" }
    ],
    proficient: [
      "Seeks information from colleagues, specialists and/or support teams to increase and/or update knowledge of teaching activities to support the learning needs of students with disability",
      "Uses knowledge and understanding of policies and legislative requirements in combination with collegiate advice and evidence-based research, to design teaching activities to support the participation and learning of students with disability",
      "Evaluates the impact of teaching activities, including resources and/or adaptive and assistive technologies, used to support participation and learning of individual students with disability",
      "Meets with specialist colleagues, parents/carers, students and/or support teams and services to develop personalised plans to support the participation and learning of students with disability",
      "Knows and applies relevant school/sector/service and legislative requirements to the design/implementation of teaching activities to support the participation and learning of students with disability",
      "Evaluates the impact of teaching activities and strategies implemented to support the participation and learning of students with disability to inform future planning"
    ]
  },
  '2.1.2': {
    look_fors: [
      { short: "Meaningful, connected activities", full: "Engages students through meaningful and connected activities to deepen their understanding of content knowledge" },
      { short: "Students show engagement with content", full: "Creates a range of learning opportunities and activities for students to demonstrate evidence of engagement with the content" },
      { short: "Varied strategies for syllabus content", full: "Delivers learning experiences using activities that engage and develop student knowledge of NSW curriculum using a range of teaching strategies and activities" }
    ],
    proficient: [
      "Knows the relevant NSW curriculum requirements and content",
      "Develops a variety of teaching strategies and activities to engage students in their learning",
      "Reflects on the impact of teaching strategies and activities on student engagement by evaluating changes in student content knowledge, learning progress and achievement",
      "Engages in personal research and professional learning to identify teaching strategies and activities proven to engage students in learning",
      "Evaluates the impact of teaching strategies and activities on student engagement to inform future planning"
    ]
  },
  '2.2.2': {
    look_fors: [
      { short: "Content organised for progress", full: "Uses the selection, organisation and delivery of content to support the learning progress and achievement of all students" },
      { short: "Learning well sequenced", full: "Uses evidence-based practices and strategies to organise content and sequence learning to support student learning progress and achievement" },
      { short: "Links prior to new learning", full: "Requires students to establish links between prior learning and new content in coherent, well-sequenced learning activities that build on and support/child student learning" }
    ],
    proficient: [
      "Determines student prior knowledge and draw links with previous learning activities to inform content selection, organisation and sequence of new learning",
      "Uses content knowledge to organise well-sequenced lessons/learning experiences and/or teaching and learning programs that create learning opportunities for the full range of students and generate learning growth",
      "Evaluates the impact of content organisation and sequencing of learning on students'’s learning progress and achievement to inform future planning",
      "Uses professional knowledge to organise coherent well sequenced teaching activities/teaching and learning programs",
      "Plans for the sequencing of teaching and learning programs/learning activities and experiences to support student learning progress and achievement",
      "Evaluates and revises the organisation of teaching and learning programs and/or learning activities to refine and improve the organisation, coherency, selection and sequencing of content and learning"
    ]
  },
  '2.3.2': {
    look_fors: [],
    proficient: [
      "Knows current NSW curriculum, assessment and reporting requirements",
      "Applies current knowledge of NSW curriculum to develop teaching and learning programs, related assessment activities/tasks, criteria and marking guidelines to assess student learning outcomes",
      "Uses knowledge of NSW curriculum, assessment and reporting requirements to provide feedback on student learning",
      "Regularly updates knowledge of NSW curriculum, assessment and reporting requirements",
      "Reports on student learning outcomes using assessment data and processes for reporting student learning progress and achievement aligned to school/system/workplace assessment and reporting requirements"
    ]
  },
  '2.4.2': {
    look_fors: [
      { short: "Content builds respect for Aboriginal cultures", full: "Uses content and implements a range of teaching strategies and learning opportunities to support students to develop their understanding of and respect for Aboriginal and Torres Strait Islander histories, cultures and languages" },
      { short: "Activities on Aboriginal histories and cultures", full: "Provides learning opportunities for students to develop their understanding of and respect for Aboriginal and Torres Strait Islander histories, cultures and languages through a range of classroom activities" }
    ],
    proficient: [
      "Collaborates with the local Aboriginal community in planning and programming of teaching and learning that provides opportunities for students to develop their understanding of and respect for Aboriginal and Torres Strait Islander histories, cultures and languages",
      "Seeks advice and support from the local Aboriginal community, Aboriginal Education officers, and/or relevant colleagues and consultants in the selection of resources for teaching and learning about Aboriginal and Torres Strait Islander histories, cultures, and languages respectfully and effectively",
      "Evaluates the effectiveness of teaching programs, resources and learning opportunities implemented to strengthen and support students to further develop their understanding of and respect for Aboriginal and Torres Strait Islander histories, cultures and languages",
      "Participates in community consultation, partnership, collaboration and/or involvement in fieldwork to develop their understanding of and respect for Aboriginal and Torres Strait Islander histories, cultures and languages",
      "Develops teaching and learning programs that embed opportunities for students to develop their understanding of and respect for Aboriginal and Torres Strait Islander histories, cultures and languages",
      "Evaluates the effectiveness of learning opportunities implemented to strengthen and support student understanding of and respect for Aboriginal and Torres Strait Islander histories, cultures and languages"
    ]
  },
  '2.5.2': {
    look_fors: [
      { short: "Literacy and numeracy strategies", full: "Implements a range of evidence-based teaching strategies to support growth in students’ literacy and numeracy achievements" },
      { short: "Works with specialist staff on literacy", full: "Collaborates with specialist staff, EAL/D teachers and/or Special Education Teachers, to apply teaching strategies designed to meet learning strengths and needs and support growth in student literacy and numeracy achievement" }
    ],
    proficient: [
      "Develops knowledge and understanding of evidence-based teaching strategies that support student literacy and numeracy achievement",
      "Uses evidence-based teaching strategies to support student literacy and numeracy achievement",
      "Monitors and evaluates the effectiveness of literacy and numeracy initiatives by reviewing/assessing a range of student work/learning",
      "Refers to student assessment data and/or NAPLAN data, and/or evaluates prior knowledge, to identify student literacy and numeracy learning strengths and needs",
      "Implements targeted literacy and numeracy teaching strategies to support growth in students’ literacy and numeracy achievement",
      "Evaluates the impact of teaching strategies implemented to improve literacy and numeracy achievement"
    ]
  },
  '2.6.2': {
    look_fors: [
      { short: "ICT builds thinking skills", full: "Uses teaching strategies to focus on learning by using ICT to develop analytical, organisational and/or problem-solving skills and engage students with content in relevant and meaningful ways" },
      { short: "Draws on students’ ICT know-how", full: "Recognises and uses student expertise/prior knowledge of ICT using evidence- based teaching strategies (including but not limited to explicitly teaching research skills, processes for gathering information from a variety of sources, strategies for critically evaluating sources and identifying new paths of inquiry) to impact learning and make content relevant and meaningful" },
      { short: "Teaches ethical ICT protocols", full: "Uses effective teaching strategies to support students to respect and value the social and ethical protocols and practices that underpin the responsible use of ICT" }
    ],
    proficient: [
      "Develops knowledge of key ICT skills, practices and teaching strategies to integrate ICT into teaching and learning programs",
      "Integrates ICT skills with teaching strategies (including but not limited to the use of multimedia, graphic creation tools, programming tools, online collaborative tools, product tools including word processors, databases and spread sheets, and working in online/virtual environments), to make content relevant and meaningful",
      "Evaluates the impact of teaching strategies used to integrate ICT into teaching and learning programs to make content relevant and meaningful",
      "Implements NSW curriculum requirements/ ELYF, integrating ICT into teaching and learning programs to make content relevant and meaningful to students",
      "Uses student work samples to evaluate the impact of teaching strategies integrating ICT into teaching and learning programs on student’s’s meaningful engagement with content"
    ]
  },
  '3.1.2': {
    look_fors: [
      { short: "Learning intentions made explicit", full: "Provides an explicit overview of learning intentions for the lesson to ensure all students are supported by appropriate learning activities to engage with the sequence of explicit, challenging and achievable learning goals" },
      { short: "Challenging, achievable goals", full: "Uses effective teaching practices and strategies to set explicit, challenging learning goals achievable for all students in a supportive classroom" },
      { short: "Every student stretched toward goals", full: "Challenges students to achieve explicit, challenging learning goals, through a variety of inclusive learning activities, responsive to individual learning strengths and needs" },
      { short: "Links tasks back to the goal", full: "Explains throughout the lesson the connection between learning activities and explicit, challenging and achievable learning goals" }
    ],
    proficient: [
      "Relates explicit challenging and achievable learning goals for all students to NSW curriculum",
      "Supports all studentren to meet explicit, challenging and achievable learning goals, using a range of learning opportunities that build on student learning strengths and needs",
      "Monitors student’s’s achievement of explicit, challenging learning goals and provides feedback",
      "Sets explicit challenging and achievable learning goals using a range of learning opportunities that support all student’s’s learning progress and achievement",
      "Differentiates learning activities to set explicit, challenging and achievable learning goals, building on students’/child learning strengths and responsive to individual learning strengths and needs",
      "Evaluates the impact of teaching strategies used to set explicit, challenging and achievable learning goals"
    ]
  },
  '3.2.2': {
    look_fors: [
      { short: "Productive learning culture", full: "Has established a culture of productive learning in the classroom, delivering a well-structured teaching and learning that engages students and promotes learning" },
      { short: "Lesson clearly well planned", full: "The teacher’s lesson delivery clearly demonstrates evidence of planning for well-structured learning and teaching that supports student engagement and promotes learning" },
      { short: "Well-structured sequence", full: "Delivers well-structured teaching and learning programs or sequence of learning activities using evidence-based strategies that engage students and promotes learning" }
    ],
    proficient: [
      "Plans for the implementation of logically sequenced lessons and activities",
      "Uses a range of evidence-based learning strategies to productively engage students and promote learning",
      "Evaluates teaching and learning programs and/or lesson sequences/learning experiences, analysing the impact of sequencing and structure on student engagement in learning",
      "Identifies student learning strengths and needs using assessment and/or feedback data to inform the structure of teaching and learning programs or lesson sequences/learning experiences to improve student engagement and promote learning",
      "Supports access to learning at a variety of learning levels and challenges and engages students to contribute productively to improve their own learning",
      "Evaluates teaching and learning programs or lesson sequences/learning experiences to analyse the level of student engagement in learning to inform future planning"
    ]
  },
  '3.3.2': {
    look_fors: [
      { short: "Critical and creative thinking", full: "Uses teaching strategies that encourage critical and creative thinking by engaging students in higher-order thinking and risk taking in a supportive classroom" },
      { short: "Students choose thinking strategies", full: "Uses teaching strategies that challenge students to select appropriate thinking strategies for learning that enable them to work independently, using knowledge, skills, problem-solving, and critical and creative thinking" },
      { short: "Problem-solving strategies", full: "Uses a range of evidence-based teaching strategies to enable students to develop knowledge, skills problem-solving and critical and creative thinking" }
    ],
    proficient: [
      "Selects evidence-based teaching strategies that build problem-solving and critical and creative thinking skills, supporting students to explore and apply knowledge, skills and understanding in new and interesting ways",
      "Implements evidence-based teaching strategies to develop student knowledge, skills, problem-solving, and critical and creative thinking",
      "Analyses the impact of teaching strategies on student application of knowledge, skills, problem-solving, and critical and creative thinking to the creation of new ideas, solutions and approaches",
      "Uses open-ended, evidence-based teaching strategies to develop student knowledge, skills, problem-solving, and critical and creative thinking",
      "Implements open-ended teaching activities that encourage students to innovate and create new ideas, solutions and approaches",
      "Analyses the impact of teaching strategies used to develop knowledge, skills, problem-solving, and critical and creative thinking"
    ]
  },
  '3.4.2': {
    look_fors: [
      { short: "Resources and ICT engage students", full: "Uses a range of selected and/or created resources, including ICT, to impact student engagement in learning" },
      { short: "Students choose from resources", full: "Creates a classroom that provides for a broad range of resources, including ICT, enabling students to make active choices and engage in learning" }
    ],
    proficient: [
      "Uses evidence-based knowledge of a range of effective resources, including ICT, to engage and support student learning progress and achievement",
      "Evaluates the impact of selected and/or created resources, including ICT, to engage students and enhance learning",
      "Plans for the selection, creation or use of a range of resources, including ICT, to support student engagement in learning",
      "Uses a range of teaching resources including ICT, to enable students to make active choices and engage in learning",
      "Evaluates the impact of a range of selected teaching resources, including ICT, on student engagement in learning using student work samples, feedback data and/or assessment data"
    ]
  },
  '3.5.2': {
    look_fors: [
      { short: "Questioning at varied levels", full: "Provides learning opportunities that support student understanding, participation, engagement and achievement, using verbal and non-verbal questioning or discussion techniques, including asking a variety of questions at appropriate levels, encouraging risk taking and acknowledging and valuing student responses" },
      { short: "Verbal and non-verbal communication", full: "Uses a range of verbal and non-verbal communication strategies to contribute to and impact on student understanding, participation, engagement and achievement" },
      { short: "Heads off misunderstandings", full: "Uses inclusive verbal and non-verbal communication to anticipate and address student misunderstandings and support student understanding, participation, engagement, and achievement" }
    ],
    proficient: [
      "Reviews teaching and learning programs and/or lesson plans for opportunities to include verbal and non-verbal communication strategies to support understanding, participation, engagement and achievement",
      "Uses a variety of evidence-based verbal and non-verbal communication strategies to communicate learning intentions and lesson goals",
      "Evaluates the impact of verbal and non-verbal communication strategies on student understanding, participation, engagement and achievement",
      "Selects from a range of evidence-based verbal and non-verbal communications strategies to support student understanding, participation, engagement and achievement",
      "Implements a range of non-verbal communication in the classroom to communicate learning intentions and lesson/learning goals to support student understanding, participation, engagement, and achievement",
      "Analyses student feedback, work samples or assessment data to gauge the impact of verbal and non-verbal communication strategies to effect student understanding, participation, engagement, and achievement and sustain students/child interaction in learning activities"
    ]
  },
  '3.6.2': {
    look_fors: [],
    proficient: [
      "Regularly gathers evidence of student learning, to inform the evaluation of lesson/learning plans/teaching and learning programs",
      "Collaborates with the Accreditation Supervisor and/or colleagues using evidence of student learning and feedback/surveys from students and parents/carers, to evaluate the impact of teaching and learning programs on student learning progress and achievement",
      "Uses self-evaluation and responds to collaborative feedback from the Accreditation Supervisor and/or colleagues to modify and improve teaching and learning programs and inform planning",
      "Develops processes for gathering evaluative data, including evidence of student learning, assessment data and feedback/surveys from students and parents/carers",
      "Analyses student and parent/carer feedback/surveys and evidence of learning and assessment data to determine impact of teaching and learning programs on student learning",
      "Uses analysis as evidence for adjustments and modifications to lesson/learning plans/teaching and learning programs"
    ]
  },
  '3.7.2': {
    look_fors: [
      { short: "Parents involved in class", full: "Observes school protocols and works collaboratively with parents/carers in the classroom to involve parents in their child’s learning" },
      { short: "Draws on parent expertise", full: "Observes school protocols and collaborates with parent/carers in the classroom, drawing on specific parent carer/expertise to contribute to the learning context and involve parents/carers in their child’s learning" }
    ],
    proficient: [
      "Knows school structures and protocols to engage parent/carers in school or classroom activities",
      "Plans contextually relevant opportunities for parents/carers to be involved in student learning activities",
      "Establishes processes for ongoing feedback and reviews feedback data to evaluate the impact of parent/carer involvement in student's/child’s learning and identify areas for ongoing improvement and development",
      "Collaborates with colleagues and/or Accreditation Supervisor and/or the wider school community to develop programs and activities designed to involve parents/carers in their child’s education",
      "Undertakes designated roles and/or participates in activities designed to involve parents/carers in their child’s education and teaching and learning program activities or experiences",
      "Collaborates in designing processes for ongoing feedback and review of feedback data, such as parent/carer surveys, to evaluate the impact of parent/carer involvement in student’s learning and identify areas for ongoing improvement and development"
    ]
  },
  '4.1.2': {
    look_fors: [
      { short: "Inclusive practices engage all", full: "Uses a range of inclusive classroom practices and interactions to engage and support all students in classroom activities, including those with learning needs or who need additional assistance or attention" },
      { short: "Inclusive group and solo work", full: "Uses evidence-based teaching strategies to engage students in individual and group work, implementing inclusive practices to create a positive, productive, supportive learning environment for all students" },
      { short: "Positive interactions, praise", full: "Has established a classroom culture based on positive interactions, implementing evidence-based approaches to create an inclusive learning environment (such as using constructive feedback and positive acknowledgement), to support all students to engage in classroom activities" }
    ],
    proficient: [
      "Plans teaching and learning experiences that are inclusive and support all students to engage in classroom activities",
      "Uses a variety of evidence-based teaching practices to promote positive interactions and create a learning environment that supports all students to engage in activities",
      "Evaluates and modifies teaching and learning experiences to promote positive interactions and engage and support all students in classroom activities",
      "Uses evidence-based teaching strategies that support and promote positive interactions, and create learning opportunities that engage and support all students in classroom activities",
      "Provides learning opportunities that are inclusive and support all students to engage in classroom activities",
      "Uses direct observation and/or student feedback to evaluate the effectiveness of teaching practices and interactions to engage and support all students in classroom activities"
    ]
  },
  '4.2.2': {
    look_fors: [
      { short: "Orderly, consistent routines", full: "Establishes an orderly approach to the management of classroom activities, using fair and consistent routines to guide student behaviour in a supportive and safe learning environment, consistent with relevant school policy" },
      { short: "Well-paced use of time", full: "Uses lesson time efficiently, delivering a well-paced lesson/experiences that moves through a variety of tasks, allowing for varying time on tasks according to the learning strengths and needs of different students to establish effective classroom routines" },
      { short: "Smooth transitions", full: "Uses orderly routines and strategies that result in smooth classroom transitions between different learning activities and group structures" },
      { short: "Strong openings and closes", full: "Regularly reviews and monitors student on task learning behaviour by using routines that include but are not limited to, the orderly opening and closure of lessons/experiences, re-connecting students with prior learning, re-capping current learning and indicating how learning will be used in future lessons" },
      { short: "Clear group roles", full: "Establishes orderly, workable routines around roles, responsibilities and expectations of all students when working in groups to support their ongoing engagement in purposeful learning" }
    ],
    proficient: [
      "Develops clear expectations for learning, using workable routines to support and structure learning activities",
      "Implements responsive and workable routines for the opening and closing of lessons/learning experiences, provides students with an outline of the lesson/experience, ensures students understand expectations for learning and checks for understanding at the end of a lesson/experience",
      "Evaluates the impact of orderly and workable routines to ensure time is spent on learning",
      "Uses evidence-based classroom management strategies and routines designed to engage individuals and groups of students in purposeful learning",
      "Implements a repertoire of strategies and orderly routines, including a context-based, flexible approach to managing classroom activities, to ensure students are purposefully engaged in learning",
      "Reflects on the impact of classroom management strategies to ensure the learning environment remains conducive to learning"
    ]
  },
  '4.3.2': {
    look_fors: [
      { short: "Clear expectations, fair responses", full: "Uses positive classroom behaviour management practices that reflect school policies, where clear expectations have been negotiated with students and behaviour management issues are resolved in a prompt, fair and respectful manner" },
      { short: "Proactive, positive management", full: "Interacts with students in a positive, equitable manner, implementing proactive behaviour management practices that address behaviour issues quickly, fairly and respectfully" },
      { short: "Consistent, respectful responses", full: "Uses a range of consistent, fair and respectful responses to student behaviour, using well-established learning routines and clear expectations to sustain an effective, positive learning environment supportive of learning" }
    ],
    proficient: [
      "Uses school discipline and welfare policies as basis for negotiating and implementing positive classroom practices in relation to managing student behaviour",
      "Uses evidence-based student behaviour management strategies, resulting in the prompt, fair, respectful resolution of discipline issues to maintain productive learning environments for all students, consistent with school discipline and welfare policies",
      "Evaluates the impact of behaviour management strategies implemented to address student behaviour issues promptly, fairly and respectfully and maintain time spent on learning",
      "Establishes specific positive behaviour management strategies by negotiating clear expectations with students that are fair and respectful",
      "Communicates clear expectations about student behaviour by providing explicit instruction about the goals of behaviour management, rights and responsibilities and the protocols, rules and consequences of disciplinary outcomes",
      "Evaluates the impact of consistent, fair and respectful behaviour management strategies on the learning progress and achievement of all students"
    ]
  },
  '4.4.2': {
    look_fors: [
      { short: "Safety procedures followed", full: "Implements appropriate safety procedures, including risk management in the classroom, compliant with school/system policies, NSW curriculum and legislative requirements to ensure student safety and wellbeing" },
      { short: "Policies met for wellbeing", full: "Demonstrates responsibility for ensuring workplace policies, NSW curriculum and legislative requirements, are met to ensure student safety and wellbeing in the learning environment" },
      { short: "Supports student wellbeing", full: "Uses a range of strategies to support student wellbeing, implement safe work practices and ensure compliance with current school system policies, NSW curriculum and legislative requirements" }
    ],
    proficient: [
      "Implements appropriate safety procedures by establishing clear safety rules and guidelines for the classroom, including risk management that reinforces safe student behaviour",
      "Reviews implementation of safety and risk management procedures to ensure compliance with current school and/or system, curriculum and legislative requirements and reports incidents as required",
      "Ensures teaching practice and classroom management complies with current legislative requirements, school and/or system policies and NSW curriculum for student wellbeing and safety",
      "Takes responsibility for implementing classroom practices that are compliant with school/system policy and procedure, NSW curriculum and legislative requirements for student wellbeing and safety",
      "Reviews the implementation of teaching practice and classroom management for compliance with current school and/or system policies, NSW curriculum and legislative requirements to ensure student safety and wellbeing"
    ]
  },
  '4.5.2': {
    look_fors: [
      { short: "Teaches and models safe ICT use", full: "Explicitly teaches and models safe, responsible and ethical use of ICT to students" },
      { short: "Students apply ICT ethics in new contexts", full: "Provides opportunities for students to engage with a range of technologies to adapt and apply their knowledge of the safe, responsible and ethical use of ICT to new contexts and situations" },
      { short: "Strategies for safe, ethical ICT", full: "Uses a range of evidence-based strategies to ensure the safe, responsible and ethical use of ICT in the learning environment" }
    ],
    proficient: [
      "Knows policy requirements and school guidelines for the safe, responsible and ethical use of ICT",
      "Develops and implements effective strategies that ensure the safe, responsible and ethical use of ICT in learning and teaching",
      "Evaluates the impact of strategies designed to ensure safe, responsible and ethical use of ICT in learning and teaching",
      "Establishes clear ICT and cyber safety rules and guidelines that are consistently implemented and monitored to ensure the safe, responsible and ethical use of ICT by students",
      "Explicitly demonstrates cyber safety rules and guidelines and the safe, responsible and ethical use of ICT (including but not limited to acknowledging digital sources in presentations and resources and/or protecting online identities to improve student knowledge, skills and awareness)",
      "Evaluates the impact of teaching and learning sequences and teaching strategies used to develop students’ knowledge and skills in the safe, responsible and ethical use of ICT"
    ]
  },
  '5.1.2': {
    look_fors: [
      { short: "Checks for understanding", full: "Uses informal and formative assessment strategies throughout a learning activity to gauge student understanding against NSW curriculum learning relevant to that activity and provide immediate feedback" },
      { short: "Quick checks, instant feedback", full: "Implements a range of short assessment strategies relevant to classroom activities, to give immediate feedback, gauge student levels of understanding and learning, and correct any misunderstanding in real time" }
    ],
    proficient: [
      "Plans and selects from a range of assessment strategies relevant to the learning schedule, the learning activity and the learning outcomes assessed",
      "Uses a variety of informal and formal, diagnostic, formative and summative assessment strategies to assess student learning",
      "Uses assessment data to diagnose individual student learning needs, plan next steps, and provide effective timely feedback about student learning",
      "Ensures assessment is an integral part of the teaching and learning cycle, allowing students to regularly demonstrate achievement of NSW curriculum",
      "Uses a variety of informal and formal, diagnostic, formative and summative assessment strategies to provide information and data about student learning",
      "Evaluates the effectiveness of assessment strategies to diagnose and identify student learning needs and provide evidence of student learning progress and achievement"
    ]
  },
  '5.2.2': {
    look_fors: [
      { short: "Timely feedback in the lesson", full: "Provides timely and effective feedback to students during the lesson to check for understanding and encourage students to reflect on and form judgements about their progress towards achieving personal learning goals" },
      { short: "Explicit, positive feedback", full: "Provides explicit, timely, positive feedback during the lesson about student learning progress and achievement, supporting reflection on and improvements to their responses" },
      { short: "Varied feedback strategies", full: "Uses a range of timely, effective and appropriate feedback strategies in a supportive learning environment to assist students improve learning progress and achievement" }
    ],
    proficient: [
      "Uses a range of data gathering points to inform judgement and target feedback about students’ learning progress and achievement",
      "Ensures student learning feedback is focused, linked to outcomes and timely, ensuring each student knows about their learning progress and the specific next steps to achieve growth relative to their learning goals",
      "Evaluates the effectiveness of feedback strategies to provide students with timely, informed responses to progress learning",
      "Uses evidence-based research to inform practice about a range of effective and appropriate feedback strategies to support student learning progress and achievement",
      "Implements a range of feedback strategies (including but not limited to, observations, discussions, marks/grades with written comments and formal written evaluations of student achievement) relative to student learning goals",
      "Evaluates the impact of feedback strategies to communicate expectations, encourage reflection and action relative to student learning progress and their learning goals"
    ]
  },
  '5.3.2': {
    look_fors: [
      { short: "Explains marking criteria", full: "Explains to students, as part of the return of work during class, how marking criteria have been developed and applied to the assessment of student work, discussing how the standards evident in sample benchmark works developed during the assessment moderation process are used to make consistent judgments about student learning across a cohort" },
      { short: "Uses benchmark samples", full: "Provides marking criteria and a range of benchmark work samples to students as part of a learning activity, to make explicit how consistent reliable judgements about student learning are made for common tasks across the cohort" }
    ],
    proficient: [
      "Collaborates with colleagues to design and/or implement a common assessment task",
      "Contributes sample benchmark responses or ‘answers could include’ responses to assessment moderation activities to support consistent teacher judgement and feedback on student learning",
      "Uses agreed marking criteria and selected benchmarks developed during assessment moderation activities when assessing student work, to support consistent, comparable judgements of student learning",
      "Collaboratively contributes to assessment moderation activities, including developing marking criteria and selecting benchmark works, to ensure consistent comparable judgements about student learning",
      "Participates in pilot/trial marking processes to test marking criteria and apply standards evident in the benchmarks to ensure the accurate, consistent application of marking criteria",
      "Provides reasons for their judgement in relation to the assessment of individual student responses by referring to marking criteria and benchmark works"
    ]
  },
  '5.4.2': {
    look_fors: [
      { short: "Adjusts teaching from checks", full: "Uses informal, formative assessment strategies during the lesson to determine student understanding of subject/content (for example, discussion and/or direct question and answer routines and/or student demonstrations of learning on the whiteboard), making real time interventions and modifications to teaching to address misunderstandings and directly assist learning" },
      { short: "Data points students to goals", full: "Uses assessment data feedback charts in the classroom to refer students to personal learning goals, making adjustments for any required interventions or modifications to teaching practice to ensure student understanding of subject content" }
    ],
    proficient: [
      "Gathers a variety of evidence of student understanding of subject/learning content in relation to NSW curriculum",
      "Uses assessment as, of and for learning across a range of learning activities to identify student learning and understanding of subject/content",
      "Analyses assessment data to identify modifications to teaching practice and learning interventions required for individual students and groups of students",
      "Analyses assessment data, identifying student learning strengths and learning needs to inform interventions, adjustments and modifications to future learning and teaching programs",
      "Differentiates and adjusts teaching and learning programs based on the analysis of assessment data to address identified learning strengths and needs and make specific interventions",
      "Gathers new assessment data to evaluate the impact of interventions and adjustments to learning and teaching programs on student understanding of subject/content"
    ]
  },
  '5.5.2': {
    look_fors: [],
    proficient: [
      "Collects student work samples and keeps an accurate record of assessment, report data and comments to track student learning progress and identify areas for improvement",
      "Contributes to a centralised record of assessment tasks and report information and/or completes assessment records and/or reports per school/system policies and requirements",
      "Develops informative reports for students and parents/carers, using accurate and reliable assessment data",
      "Evaluates the effectiveness of report information to communicate student learning progress and achievement, reflective of school/system policies and requirements, using feedback from students and/or parent/carer"
    ]
  },
  '6.1.2': {
    look_fors: [],
    proficient: [
      "Uses the Australian Professional Standards for Teachers to plan professional learning and identify specific professional learning goals targeted at improving teaching practice",
      "Develops effective relationships with colleagues, including the Accreditation Supervisor, to support professional learning relative to professional learning goals",
      "Evaluates and keeps records of professional development activities aligned to improving specific teaching practices identified by the Standard Descriptors for Proficient Teacher",
      "Reflects on teaching practice using the Australian Professional Standards for Teachers to identify professional learning goals",
      "Engages in professional learning (including but not limited to, internal observation of high- quality models of teaching practice, sharing of expertise, constructive professional feedback, school/employer based professional learning and externally provided professional learning)",
      "Applies new knowledge and skills to teaching practice and is responsive to suggestions from Accreditation Supervisors and colleagues for improvements to practice"
    ]
  },
  '6.2.2': {
    look_fors: [],
    proficient: [
      "Works collaboratively with a range of colleagues as part of a team (including but not limited to, EAL/D teachers, gifted and talented teachers, Special Education Teachers, early intervention teachers and Aboriginal Education Officers), to contribute to collegial discussions and improve professional knowledge and practice",
      "Acknowledges and responds to constructive feedback and applies feedback from colleagues to improve practice",
      "Works with colleagues to implement improved professional knowledge and practice and evaluate impact on student learning progress and achievement",
      "Collaborates with colleagues to plan, write, evaluate and reflect on programs and/or units of work and generate ideas for improvement",
      "Uses professional knowledge to implement revised programs and/or units of work",
      "Contributes to the review and evaluation of programs and units of work to improve professional knowledge and teaching practice and act on feedback"
    ]
  },
  '6.3.2': {
    look_fors: [],
    proficient: [
      "Works collaboratively with a range of colleagues as part of a team, including but not limited to, EAL/D teachers, gifted and talented teachers, Special Education Teachers, early intervention workers and Aboriginal Education Officers, to contribute to collegial discussions and improve professional knowledge and practice",
      "Acknowledges and responds to constructive feedback and applies feedback from colleagues to improve practice and student learning progress and achievement",
      "Works with colleagues to implement improved professional knowledge and practice and evaluate impact on student learning progress and achievement",
      "Collaborates with colleagues to plan, write, evaluate and reflect on programs and/or units of work and contribute to discussions and generate ideas for improvement",
      "Uses professional knowledge to implement revised programs and/or units of work",
      "Contributes to the review and evaluation of programs and units of work to improve professional knowledge and teaching practice and act on feedback"
    ]
  },
  '6.4.2': {
    look_fors: [],
    proficient: [
      "Analyses student assessment data to identify student learning needs",
      "Critically evaluates the effectiveness of current teaching practice to address identified student learning needs",
      "Uses evaluation of assessment data and teaching practice to identify and undertake professional learning designed to improve teaching practice to address identified student learning needs",
      "Undertakes professional learning to support the analysis of teaching practice and its impact on identified student learning needs",
      "Applies professional learning to teaching practice and the design and delivery of learning activities to support the identified learning needs of a range of students",
      "Uses student observation, assessment or feedback data to evaluate the effectiveness of changes to teaching practices as a result of professional learning to address identified student learning needs"
    ]
  },
  '7.1.2': {
    look_fors: [
      { short: "Behaviour managed per policy", full: "Manages student behaviour using classroom and/or student management plan that reflects the implementation of school and/or system policies and procedures" }
    ],
    proficient: [
      "Knows the school and/or systems/sectors code/s of ethics and conduct and the regulatory requirements that apply to their teaching context",
      "Adheres to code/s of conducts, ethical behaviour and regulatory requirements and applies established procedures across the full range of professional activities (including but not limited to requirements for student privacy and confidentiality, record keeping and professional expectations and responsibilities when dealing with students, colleagues and the community)",
      "Monitors self when engaging with students, colleagues and the community and responds to issues regarding conduct and ethical behaviour with colleagues and/or school/system leadership where required",
      "Engages with and understands school and/or systems/sector policies and procedures in relation to codes of ethics and conduct and the regulatory requirements that apply to their teaching context",
      "Complies with school policies and procedures in relation to codes of ethics and conduct and regulatory requirements (including but not limited to, reporting on student welfare, record keeping requirements and responsibilities regarding privacy and confidentiality)",
      "Employs appropriate, well-reasoned and justifiable actions across all aspects of professional conduct, including ethical behaviour and meeting regulatory requirements"
    ]
  },
  '7.2.2': {
    look_fors: [
      { short: "Meets professional requirements", full: "Complies with legislative, administrative, organisational and professional requirements as part of their teaching practice" },
      { short: "Applies WHS and inclusion rules", full: "Implements relevant legislative, administrative, organisational and professional requirements in their teaching practice, including but not limited to conflict resolution strategies, WHS and inclusive education legislation" }
    ],
    proficient: [
      "Incorporates legislative requirements and mandatory school and system/sector procedures and policy into teaching and learning programs and teaching practice",
      "Regularly reviews the inclusion of mandatory policies and legislative requirements in teaching practice and updates to ensure accuracy",
      "Interprets legislative, administrative and organisational requirements that apply to their teaching context to ensure understanding and compliance",
      "Checks for accuracy and compliance with legislative, administrative, organisational or mandatory requirements and/ or school/sector policies and processes to modify and adjust teaching and learning programs and/or lesson/learning plans and/or classroom practice where required",
      "Monitors and evaluates the incorporation of school policies and processes to ensure legislative, administrative, organisational and professional requirements are met"
    ]
  },
  '7.3.2': {
    look_fors: [],
    proficient: [
      "Plans and initiates discussions with parents/carers about their child’s learning and wellbeing, following established school protocols for respectful communication with parents/carers",
      "Implements agreed strategies in response to discussions with parents/carers to support student learning and wellbeing, and provides evidence of student learning progress and achievement",
      "Follows up on communications and meets with parents/carers to provide feedback on improvements in student learning and wellbeing",
      "Seeks and uses feedback from parents/carers about their child’s learning and wellbeing",
      "Works collaboratively with parents/carers to develop a communication plan that provides regular, easily accessible information about their child’s learning and wellbeing",
      "Devises and implements a communication plan that supports parents/carers to be involved in their child’s learning and provide timely responses to parent/carer enquiries and feedback"
    ]
  },
  '7.4.2': {
    look_fors: [],
    proficient: [
      "Seeks opportunities to network and attend professional network meetings (including but not limited to, online educational forums, professional associations, local area networks and learning communities/communities of practice), targeting identified professional learning needs to broaden knowledge and improve practice",
      "Applies knowledge and uses resources from participation in professional and community networks to improve practice",
      "Evaluates the impact of enhanced knowledge to improve teaching practice and progress student learning",
      "Actively participates in professional networks and associations (including but not limited to, participating in professional associations, keeping up to date with NSW curriculum and policy changes, online education forums engaging with current research and developments in teaching and learning resources)",
      "Follows school policy and procedures to engage specialist expertise and/or school community expertise to improve teaching and learning",
      "Evaluates the application of knowledge sourced from specialist expertise and expertise in the wider school community, to impact on teaching practice and improve student learning progress and achievement"
    ]
  }
};

export const guideFor = (code: string): DescriptorGuide => DESCRIPTOR_GUIDE[code] ?? { look_fors: [], proficient: [] };
