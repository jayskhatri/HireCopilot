CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar NOT NULL,
  department varchar NOT NULL DEFAULT 'Engineering',
  description text,
  location varchar NOT NULL DEFAULT 'Bengaluru, IN',
  required_skills text[] NOT NULL DEFAULT '{}',
  open_since timestamptz NOT NULL DEFAULT now(),
  status varchar NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.interviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  email varchar NOT NULL UNIQUE,
  title varchar NOT NULL DEFAULT 'Engineering Manager',
  skills text[] NOT NULL DEFAULT '{}',
  timezone varchar NOT NULL DEFAULT 'Asia/Kolkata',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name varchar NOT NULL,
  last_name varchar NOT NULL,
  email varchar NOT NULL UNIQUE,
  phone varchar,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  source varchar NOT NULL DEFAULT 'Referral',
  experience_years numeric NOT NULL DEFAULT 5,
  skills text[] NOT NULL DEFAULT '{}',
  current_stage varchar NOT NULL DEFAULT 'SCREENING',
  status_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  interviewer_id uuid REFERENCES public.interviewers(id) ON DELETE SET NULL,
  stage varchar NOT NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  meeting_link text,
  status varchar NOT NULL DEFAULT 'SCHEDULED',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.interview_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  decision varchar NOT NULL DEFAULT 'BORDERLINE',
  overall_score numeric NOT NULL DEFAULT 0,
  rubric_responses jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_comments text,
  risk_level varchar NOT NULL DEFAULT 'LOW',
  risk_rationale text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.candidate_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  action_type varchar NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidates_stage ON public.candidates(current_stage);
CREATE INDEX idx_interviews_start ON public.interviews(scheduled_start);
CREATE INDEX idx_activity_candidate ON public.candidate_activity_log(candidate_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs, public.interviewers, public.candidates, public.interviews, public.interview_feedback, public.candidate_activity_log TO anon, authenticated;
GRANT ALL ON public.jobs, public.interviewers, public.candidates, public.interviews, public.interview_feedback, public.candidate_activity_log TO service_role;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo_all_jobs" ON public.jobs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo_all_interviewers" ON public.interviewers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo_all_candidates" ON public.candidates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo_all_interviews" ON public.interviews FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo_all_feedback" ON public.interview_feedback FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo_all_activity" ON public.candidate_activity_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO public.jobs (title, department, description, location, required_skills, open_since, status) VALUES
('Senior Full Stack Engineer','Engineering','Own end-to-end delivery of customer facing products across React, Node.js and PostgreSQL.','Bengaluru, IN',ARRAY['React','Node.js','PostgreSQL','System Design'], now() - interval '21 days','OPEN'),
('Java Architect','Engineering','Define architecture for large scale Java microservice platforms.','Pune, IN',ARRAY['Java','Spring Boot','Microservices','System Design'], now() - interval '34 days','OPEN'),
('SAP Consultant','Enterprise Apps','Implement and support SAP S/4HANA modules for enterprise clients.','Hyderabad, IN',ARRAY['SAP','ABAP','S/4HANA'], now() - interval '29 days','OPEN'),
('Azure Engineer','Cloud Platform','Build and operate Azure landing zones and CI/CD pipelines.','Remote, IN',ARRAY['Azure','Terraform','Kubernetes','CI/CD'], now() - interval '25 days','OPEN'),
('Data Scientist','Data & AI','Build predictive models and ship them to production.','Bengaluru, IN',ARRAY['Python','ML','SQL','Statistics'], now() - interval '18 days','OPEN'),
('DevOps Engineer','Cloud Platform','Own reliability, observability and release automation.','Chennai, IN',ARRAY['Kubernetes','Docker','CI/CD','AWS'], now() - interval '17 days','OPEN'),
('Frontend Engineer','Engineering','Craft delightful, accessible interfaces in React and TypeScript.','Remote, IN',ARRAY['React','TypeScript','CSS'], now() - interval '12 days','OPEN'),
('Product Manager','Product','Drive discovery and delivery for the hiring platform.','Bengaluru, IN',ARRAY['Product Strategy','Analytics','Stakeholder Management'], now() - interval '9 days','OPEN');

INSERT INTO public.interviewers (name, email, title, skills, timezone) VALUES
('John Doe','john.doe@company.com','Principal Engineer',ARRAY['React','Node.js','PostgreSQL','System Design'],'Asia/Kolkata'),
('Sarah Connor','sarah.connor@company.com','Engineering Manager',ARRAY['Java','Spring Boot','Microservices','System Design'],'Asia/Kolkata'),
('Vikram Rao','vikram.rao@company.com','Staff Engineer',ARRAY['Azure','Kubernetes','Terraform','CI/CD'],'Asia/Kolkata'),
('Emily Chen','emily.chen@company.com','Data Science Lead',ARRAY['Python','ML','SQL','Statistics'],'Asia/Singapore'),
('Arjun Menon','arjun.menon@company.com','SRE Lead',ARRAY['Kubernetes','Docker','AWS','CI/CD'],'Asia/Kolkata'),
('Priya Iyer','priya.iyer@company.com','Frontend Architect',ARRAY['React','TypeScript','CSS','Accessibility'],'Asia/Kolkata'),
('Daniel Okafor','daniel.okafor@company.com','SAP Practice Lead',ARRAY['SAP','ABAP','S/4HANA'],'Europe/London'),
('Meera Nair','meera.nair@company.com','Director of Product',ARRAY['Product Strategy','Analytics','Stakeholder Management'],'Asia/Kolkata');

INSERT INTO public.candidates (first_name,last_name,email,phone,job_id,source,experience_years,skills,current_stage,status_updated_at,created_at)
SELECT v.fn, v.ln, v.em, v.ph, j.id, v.src, v.exp, v.sk, v.stage, now() - (v.days || ' days')::interval, now() - ((v.days + 14) || ' days')::interval
FROM (VALUES
('Rahul','Sharma','rahul.sharma@example.com','+91 98450 11001','Senior Full Stack Engineer','Referral',8.0,ARRAY['React','Node.js','PostgreSQL'],'L2',4),
('Sneha','Verma','sneha.verma@example.com','+91 98450 11002','Senior Full Stack Engineer','LinkedIn',6.0,ARRAY['React','Node.js','GraphQL'],'L1',1),
('Aman','Singh','aman.singh@example.com','+91 98450 11003','Frontend Engineer','Careers Site',5.0,ARRAY['React','TypeScript','CSS'],'SCREENING',0),
('Neha','Patel','neha.patel@example.com','+91 98450 11004','Java Architect','Referral',11.0,ARRAY['Java','Spring Boot','Microservices'],'L2',2),
('Pooja','Sharma','pooja.sharma@example.com','+91 98450 11005','Data Scientist','LinkedIn',7.0,ARRAY['Python','ML','SQL'],'OFFER',3),
('Karthik','Raman','karthik.raman@example.com','+91 98450 11006','Azure Engineer','Vendor',9.0,ARRAY['Azure','Terraform','Kubernetes'],'L3',6),
('Ananya','Das','ananya.das@example.com','+91 98450 11007','DevOps Engineer','Referral',6.0,ARRAY['Kubernetes','Docker','AWS'],'L1',5),
('Rohit','Malhotra','rohit.malhotra@example.com','+91 98450 11008','SAP Consultant','Vendor',10.0,ARRAY['SAP','ABAP','S/4HANA'],'SCREENING',7),
('Divya','Krishnan','divya.krishnan@example.com','+91 98450 11009','Product Manager','LinkedIn',8.0,ARRAY['Product Strategy','Analytics'],'L2',1),
('Siddharth','Joshi','siddharth.joshi@example.com','+91 98450 11010','Senior Full Stack Engineer','Careers Site',7.0,ARRAY['React','Node.js','AWS'],'SCREENING',2),
('Meghna','Bose','meghna.bose@example.com','+91 98450 11011','Frontend Engineer','Referral',4.0,ARRAY['React','TypeScript'],'L1',4),
('Nikhil','Gupta','nikhil.gupta@example.com','+91 98450 11012','Java Architect','LinkedIn',12.0,ARRAY['Java','Kafka','Microservices'],'L3',2),
('Ishita','Reddy','ishita.reddy@example.com','+91 98450 11013','Data Scientist','Careers Site',5.0,ARRAY['Python','SQL','Statistics'],'L1',0),
('Aditya','Kulkarni','aditya.kulkarni@example.com','+91 98450 11014','DevOps Engineer','Vendor',8.0,ARRAY['Kubernetes','CI/CD','Terraform'],'L2',5),
('Sanjana','Pillai','sanjana.pillai@example.com','+91 98450 11015','Azure Engineer','Referral',6.0,ARRAY['Azure','CI/CD'],'SCREENING',1),
('Varun','Chopra','varun.chopra@example.com','+91 98450 11016','SAP Consultant','LinkedIn',9.0,ARRAY['SAP','S/4HANA'],'L1',8),
('Tanvi','Deshmukh','tanvi.deshmukh@example.com','+91 98450 11017','Product Manager','Referral',7.0,ARRAY['Analytics','Discovery'],'OFFER',2),
('Harsh','Vardhan','harsh.vardhan@example.com','+91 98450 11018','Senior Full Stack Engineer','LinkedIn',6.0,ARRAY['Node.js','PostgreSQL'],'REJECTED',9),
('Lakshmi','Narayan','lakshmi.narayan@example.com','+91 98450 11019','Frontend Engineer','Careers Site',3.0,ARRAY['React','CSS'],'REJECTED',11),
('Farhan','Ali','farhan.ali@example.com','+91 98450 11020','Data Scientist','Referral',9.0,ARRAY['Python','ML','MLOps'],'L3',3),
('Shreya','Kapoor','shreya.kapoor@example.com','+91 98450 11021','Java Architect','Vendor',13.0,ARRAY['Java','System Design'],'SCREENING',4),
('Manish','Agarwal','manish.agarwal@example.com','+91 98450 11022','DevOps Engineer','LinkedIn',7.0,ARRAY['AWS','Docker'],'SCREENING',0),
('Ritika','Sen','ritika.sen@example.com','+91 98450 11023','Azure Engineer','Careers Site',5.0,ARRAY['Azure','Kubernetes'],'L1',2),
('Abhishek','Nair','abhishek.nair@example.com','+91 98450 11024','Senior Full Stack Engineer','Referral',10.0,ARRAY['React','Node.js','System Design'],'L3',1),
('Kavya','Suresh','kavya.suresh@example.com','+91 98450 11025','Product Manager','LinkedIn',6.0,ARRAY['Product Strategy'],'L1',6),
('Ramesh','Kumar','ramesh.kumar@example.com','+91 98450 11026','SAP Consultant','Vendor',14.0,ARRAY['SAP','ABAP'],'L2',10),
('Swati','Mishra','swati.mishra@example.com','+91 98450 11027','Data Scientist','Referral',4.0,ARRAY['Python','SQL'],'SCREENING',3),
('Deepak','Chauhan','deepak.chauhan@example.com','+91 98450 11028','Frontend Engineer','LinkedIn',5.0,ARRAY['React','TypeScript','Testing'],'L2',0),
('Nandini','Rao','nandini.rao@example.com','+91 98450 11029','Java Architect','Careers Site',11.0,ARRAY['Java','Spring Boot'],'OFFER',1),
('Yash','Thakur','yash.thakur@example.com','+91 98450 11030','DevOps Engineer','Referral',6.0,ARRAY['Kubernetes','Observability'],'L3',4),
('Aarti','Bhatt','aarti.bhatt@example.com','+91 98450 11031','Azure Engineer','LinkedIn',8.0,ARRAY['Azure','Terraform'],'REJECTED',14),
('Imran','Sheikh','imran.sheikh@example.com','+91 98450 11032','Senior Full Stack Engineer','Vendor',7.0,ARRAY['Node.js','React'],'L1',3),
('Preeti','Yadav','preeti.yadav@example.com','+91 98450 11033','Product Manager','Referral',9.0,ARRAY['Roadmapping','Analytics'],'SCREENING',5),
('Gaurav','Saxena','gaurav.saxena@example.com','+91 98450 11034','Data Scientist','LinkedIn',6.0,ARRAY['ML','Python'],'L2',7),
('Bhavna','Rathore','bhavna.rathore@example.com','+91 98450 11035','Frontend Engineer','Careers Site',4.0,ARRAY['React','Design Systems'],'SCREENING',1),
('Sameer','Khan','sameer.khan@example.com','+91 98450 11036','SAP Consultant','Referral',12.0,ARRAY['SAP','S/4HANA','Finance'],'L3',2),
('Anjali','Mehta','anjali.mehta@example.com','+91 98450 11037','Java Architect','LinkedIn',10.0,ARRAY['Java','Kafka'],'L1',0),
('Rakesh','Pandey','rakesh.pandey@example.com','+91 98450 11038','DevOps Engineer','Vendor',8.0,ARRAY['AWS','Terraform'],'L1',9),
('Snehal','Patil','snehal.patil@example.com','+91 98450 11039','Azure Engineer','Referral',7.0,ARRAY['Azure','DevOps'],'L2',1),
('Vivek','Anand','vivek.anand@example.com','+91 98450 11040','Senior Full Stack Engineer','Careers Site',9.0,ARRAY['React','PostgreSQL','Node.js'],'OFFER',2)
) AS v(fn,ln,em,ph,job_title,src,exp,sk,stage,days)
JOIN public.jobs j ON j.title = v.job_title;

INSERT INTO public.interviews (candidate_id, job_id, interviewer_id, stage, scheduled_start, scheduled_end, meeting_link, status)
SELECT c.id, c.job_id, i.id, v.stage,
       date_trunc('day', now()) + v.start_hour * interval '1 hour',
       date_trunc('day', now()) + v.start_hour * interval '1 hour' + interval '1 hour',
       'https://teams.microsoft.com/l/meetup-join/hirecopilot/' || substr(md5(c.email || v.stage), 1, 12),
       v.status
FROM (VALUES
('rahul.sharma@example.com','john.doe@company.com','L2',9.0,'COMPLETED'),
('sneha.verma@example.com','priya.iyer@company.com','L1',10.5,'SCHEDULED'),
('aman.singh@example.com','meera.nair@company.com','SCREENING',12.0,'SCHEDULED'),
('neha.patel@example.com','sarah.connor@company.com','L2',14.5,'SCHEDULED'),
('karthik.raman@example.com','vikram.rao@company.com','L3',16.0,'SCHEDULED'),
('farhan.ali@example.com','emily.chen@company.com','L3',17.5,'SCHEDULED')
) AS v(cand_email, int_email, stage, start_hour, status)
JOIN public.candidates c ON c.email = v.cand_email
JOIN public.interviewers i ON i.email = v.int_email;

INSERT INTO public.interviews (candidate_id, job_id, interviewer_id, stage, scheduled_start, scheduled_end, meeting_link, status)
SELECT c.id, c.job_id, i.id, v.stage,
       now() - (v.days_ago || ' days')::interval,
       now() - (v.days_ago || ' days')::interval + interval '1 hour',
       'https://teams.microsoft.com/l/meetup-join/hirecopilot/' || substr(md5(c.email || v.stage || v.days_ago::text), 1, 12),
       'COMPLETED'
FROM (VALUES
('rahul.sharma@example.com','priya.iyer@company.com','L1',9),
('aditya.kulkarni@example.com','arjun.menon@company.com','L2',5),
('ramesh.kumar@example.com','daniel.okafor@company.com','L2',10),
('gaurav.saxena@example.com','emily.chen@company.com','L2',7),
('varun.chopra@example.com','daniel.okafor@company.com','L1',8),
('rakesh.pandey@example.com','arjun.menon@company.com','L1',9),
('pooja.sharma@example.com','emily.chen@company.com','L3',4),
('nandini.rao@example.com','sarah.connor@company.com','L3',3)
) AS v(cand_email, int_email, stage, days_ago)
JOIN public.candidates c ON c.email = v.cand_email
JOIN public.interviewers i ON i.email = v.int_email;

INSERT INTO public.interview_feedback (interview_id, decision, overall_score, rubric_responses, summary_comments, risk_level, risk_rationale, submitted_at)
SELECT iv.id, v.decision, v.score, '[]'::jsonb, v.comments, v.risk, v.rationale, now() - interval '2 days'
FROM (VALUES
('pooja.sharma@example.com','L3','SELECT',8.4,'Strong modelling depth, communicated trade-offs clearly.','LOW','High and consistent scores with no unresolved concerns.'),
('nandini.rao@example.com','L3','SELECT',8.8,'Excellent architecture reasoning and stakeholder handling.','LOW','Consistently strong across all rubric areas.'),
('gaurav.saxena@example.com','L2','BORDERLINE',5.6,'Solid Python but weak on productionising models; vague on evaluation metrics.','HIGH','Average below 6.0 and unresolved gaps in production ML experience.')
) AS v(cand_email, stage, decision, score, comments, risk, rationale)
JOIN public.candidates c ON c.email = v.cand_email
JOIN public.interviews iv ON iv.candidate_id = c.id AND iv.stage = v.stage AND iv.status = 'COMPLETED';

INSERT INTO public.candidate_activity_log (candidate_id, action_type, details, created_at)
SELECT c.id, 'APPLICATION_RECEIVED', jsonb_build_object('source', c.source), c.created_at FROM public.candidates c;

INSERT INTO public.candidate_activity_log (candidate_id, action_type, details, created_at)
SELECT c.id, 'STAGE_CHANGED', jsonb_build_object('to_stage', c.current_stage), c.status_updated_at FROM public.candidates c;

INSERT INTO public.candidate_activity_log (candidate_id, action_type, details, created_at)
SELECT iv.candidate_id, 'INTERVIEW_SCHEDULED',
       jsonb_build_object('stage', iv.stage, 'interviewer', i.name, 'scheduled_start', iv.scheduled_start),
       iv.created_at
FROM public.interviews iv JOIN public.interviewers i ON i.id = iv.interviewer_id;