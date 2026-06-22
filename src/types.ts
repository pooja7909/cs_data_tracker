export type YearGroup = 7 | 8 | 9 | '10 IGCSE' | '11 IGCSE' | '12 IB' | '13 IB' | 'Graduated';

export interface Student {
  id: string;
  teacherId?: string;
  name: string;
  preferredName?: string;
  yearGroup: YearGroup;
  groupName: string;
  academicYear: string;
  ibLevel?: 'HL' | 'SL';
  academicHouse?: string;
  isNew?: boolean;
  notes?: string;
  baselineGrade?: string;
}

export interface Group {
  id: string;
  teacherId?: string;
  yearGroup: YearGroup;
  name: string;
  academicYear: string;
}

export interface Question {
  number: string;
  maxMarks: number;
}

export interface Assessment {
  id: string;
  teacherId?: string;
  name: string;
  subject: string;
  date: string;
  maxMarks: number;
  yearGroup: YearGroup;
  academicYear: string;
  ibLevel?: 'HL' | 'SL' | 'Both';
  boundaries?: GradeBoundary[];
  questions?: Question[];
  isLocked?: boolean;
}

export interface Mark {
  id: string;
  teacherId?: string;
  studentId: string;
  assessmentId: string;
  score: number;
  resitScore?: number;
  resitMaxMarks?: number;
  questionScores?: Record<string, number>;
  absent?: boolean;
  newAdmission?: boolean;
}

export interface GradeBoundary {
  grade: string;
  minPercentage: number;
}

export interface StudentPerformance {
  student: Student;
  marks: (Mark & { assessment: Assessment })[];
  sittingMarks: (Mark & { assessment: Assessment })[];
  absentCount: number;
  averagePercentage: number;
  averagePoints: number;
  hasData: boolean;
  trend: 'improving' | 'declining' | 'stable';
  status: 'excellent' | 'on-track' | 'needs-improvement' | 'no-data';
  isConcern: boolean;
  baselinePoints: number | null;
}
