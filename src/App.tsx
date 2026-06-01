import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  BarChart3, 
  Settings, 
  Plus, 
  Upload, 
  ChevronRight, 
  ChevronDown,
  TrendingUp, 
  TrendingDown, 
  Minus,
  Trash2,
  Download,
  Edit2,
  Search,
  Filter,
  Calendar,
  X,
  FileText,
  List,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Cloud,
  History,
  RefreshCw,
  Database,
  ArrowRight,
  HelpCircle,
  Lock,
  Unlock,
  Save,
  Target,
  Star
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  Cell
} from 'recharts';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import { getStudents, getAssessments, getMarks, getGroups, getYearBoundaries, updateYearBoundaries, deleteStudent as fbDeleteStudent, deleteAssessment as fbDeleteAssessment, deleteMark as fbDeleteMark, deleteGroup as fbDeleteGroup, subscribeToData, subscribeToConfig, addStudent as fbAddStudent, addAssessment as fbAddAssessment, addGroup as fbAddGroup, updateStudent as fbUpdateStudent, updateAssessment as fbUpdateAssessment, updateGroup as fbUpdateGroup, setMark as fbSetMark, getMarkId } from './services/firebaseService';
import { auth, db } from './firebase';
import { 
  setDoc, 
  doc, 
  deleteDoc, 
  updateDoc, 
  getDoc, 
  onSnapshot, 
  collection, 
  query, 
  where 
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { ShieldCheck, KeyRound, Eye, EyeOff } from 'lucide-react';

import { 
  Student, 
  Assessment, 
  Mark, 
  GradeBoundary, 
  YearGroup, 
  StudentPerformance,
  Group,
  Question
} from './types';

const normYear = (s: string | number | undefined) => {
  let str = String(s || '').toLowerCase().replace(/\s+/g, '').trim();
  // Strip sl/hl suffixes from IB years for broader matching
  // (e.g. "12 IB SL" should match "12 IB" in terms of year group)
  if (str.includes('ib')) {
    str = str.replace(/(sl|hl)$/, '');
  }
  return str;
};

const SUBJECTS_BY_YEAR: Record<YearGroup, string[]> = {
  7: ['Computer Science'],
  8: ['Computer Science'],
  9: ['Computer Science'],
  '10 IGCSE': ['Computer Science'],
  '11 IGCSE': ['Computer Science'],
  '12 IB': ['Computer Science'],
  '13 IB': ['Computer Science'],
  'Graduated': ['Computer Science'],
};

const SUBJECT_COLORS: Record<string, string> = {
  'Computer Science': '#8b5cf6', // Violet
};

const KS3_BOUNDARIES: GradeBoundary[] = [
  { grade: 'Outstanding', minPercentage: 90 },
  { grade: 'Significantly Above', minPercentage: 80 },
  { grade: 'Above', minPercentage: 70 },
  { grade: 'At', minPercentage: 50 },
  { grade: 'Below', minPercentage: 40 },
  { grade: 'Significantly Below', minPercentage: 0 },
];

const IGCSE_BOUNDARIES: GradeBoundary[] = [
  { grade: '9', minPercentage: 90 },
  { grade: '8', minPercentage: 80 },
  { grade: '7', minPercentage: 70 },
  { grade: '6', minPercentage: 60 },
  { grade: '5', minPercentage: 50 },
  { grade: '4', minPercentage: 40 },
  { grade: '3', minPercentage: 30 },
  { grade: '2', minPercentage: 20 },
  { grade: '1', minPercentage: 0 },
];

const IB_BOUNDARIES: GradeBoundary[] = [
  { grade: '7', minPercentage: 90 },
  { grade: '6', minPercentage: 80 },
  { grade: '5', minPercentage: 70 },
  { grade: '4', minPercentage: 60 },
  { grade: '3', minPercentage: 50 },
  { grade: '2', minPercentage: 40 },
  { grade: '1', minPercentage: 0 },
];

const DEFAULT_BOUNDARIES: GradeBoundary[] = KS3_BOUNDARIES;

const INITIAL_STUDENTS: Student[] = [];

const INITIAL_ASSESSMENTS: Assessment[] = [];

const INITIAL_MARKS: Mark[] = [];

const ACADEMIC_YEARS = Array.from({ length: 2035 - 2023 + 1 }, (_, i) => {
  const startYear = 2023 + i;
  const endYear = (startYear + 1) % 100;
  return `${startYear}-${endYear.toString().padStart(2, '0')}`;
});
const CURRENT_ACADEMIC_YEAR = '2025-26';

const getNextAcademicYear = (current: string): string | null => {
  const idx = ACADEMIC_YEARS.indexOf(current);
  return idx < ACADEMIC_YEARS.length - 1 ? ACADEMIC_YEARS[idx + 1] : null;
};

const getPreviousAcademicYear = (current: string): string | null => {
  const idx = ACADEMIC_YEARS.indexOf(current);
  return idx > 0 ? ACADEMIC_YEARS[idx - 1] : null;
};

const getNextYearGroup = (current: YearGroup): YearGroup | 'Graduated' | null => {
  if (current === 7) return 8;
  if (current === 8) return 9;
  if (current === 9) return '10 IGCSE';
  if (current === '10 IGCSE') return '11 IGCSE';
  if (current === '11 IGCSE') return '12 IB';
  if (current === '12 IB') return '13 IB';
  if (current === '13 IB') return 'Graduated';
  return null;
};

const getPreviousYearGroup = (current: YearGroup | 'Graduated'): YearGroup | null => {
  if (current === 8) return 7;
  if (current === 9) return 8;
  if (current === '10 IGCSE') return 9;
  if (current === '11 IGCSE') return '10 IGCSE';
  if (current === '12 IB') return '11 IGCSE';
  if (current === '13 IB') return '12 IB';
  if (current === 'Graduated') return '13 IB';
  return null;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'performance' | 'students' | 'assessments' | 'settings' | 'concerns'>('dashboard');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('science-tracker-academic-year');
      return saved || CURRENT_ACADEMIC_YEAR;
    } catch (e) {
      return CURRENT_ACADEMIC_YEAR;
    }
  });

  useEffect(() => {
    localStorage.setItem('science-tracker-academic-year', selectedAcademicYear);
  }, [selectedAcademicYear]);

  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS);
  const [assessments, setAssessments] = useState<Assessment[]>(INITIAL_ASSESSMENTS);
  const [marks, setMarks] = useState<Mark[]>(INITIAL_MARKS);
  const [yearBoundaries, setYearBoundaries] = useState<Record<string, GradeBoundary[]>>({
    '7': [...KS3_BOUNDARIES],
    '8': [...KS3_BOUNDARIES],
    '9': [...KS3_BOUNDARIES],
    '10 IGCSE': [...IGCSE_BOUNDARIES],
    '11 IGCSE': [...IGCSE_BOUNDARIES],
    '12 IB': [...IB_BOUNDARIES],
    '13 IB': [...IB_BOUNDARIES],
  });
  const [lockedYearBoundaries, setLockedYearBoundaries] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('lockedYearBoundaries');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('lockedYearBoundaries', JSON.stringify(lockedYearBoundaries));
  }, [lockedYearBoundaries]);

  const [selectedSettingScope, setSelectedSettingScope] = useState<string>('7');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<YearGroup | 'all' | 'IGCSE_ALL' | 'IB_ALL'>(7);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [showMarksModal, setShowMarksModal] = useState<string | null>(null);
  const [showBoundaryShare, setShowBoundaryShare] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    type?: 'danger' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [importPreview, setImportPreview] = useState<{assessments: string[], students: number, marks: number, groups: string[]} | null>(null);
  const [importColumnSubjects, setImportColumnSubjects] = useState<Record<string, string>>({});
  const [pendingImport, setPendingImport] = useState<{ data: any[], fileName: string, sheetName?: string } | null>(null);
  const [importConfig, setImportConfig] = useState({ 
    yearGroup: 7 as YearGroup, 
    groupName: '', 
    assessmentName: '', 
    subject: 'Computer Science', 
    maxMarks: 100, 
    date: new Date().toISOString().split('T')[0] 
  });
  const [selectedGroupDetails, setSelectedGroupDetails] = useState<Group | null>(null);
  const [marksGroupFilter, setMarksGroupFilter] = useState<string>('all');
  const [newAssessment, setNewAssessment] = useState<{
    name: string;
    subject: string;
    maxMarks: number;
    date: string;
    yearGroup: YearGroup;
    ibLevel?: 'HL' | 'SL' | 'Both';
  }>({ 
    name: '', 
    subject: 'Computer Science', 
    maxMarks: 100, 
    date: new Date().toISOString().split('T')[0], 
    yearGroup: 7 as YearGroup,
    ibLevel: 'Both'
  });
  const [newStudent, setNewStudent] = useState<{
    name: string;
    preferredName: string;
    yearGroup: YearGroup;
    groupName: string;
    ibLevel?: 'HL' | 'SL';
    isNew: boolean;
    notes: string;
    baselineGrade?: string;
  }>({ name: '', preferredName: '', yearGroup: 7 as YearGroup, groupName: '', isNew: false, notes: '', baselineGrade: '' });

  const [marksEntryMode, setMarksEntryMode] = useState<'score' | 'percentage' | 'grade'>('score');

  // Authentication & System State
  const [isSystemLoading, setIsSystemLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsSystemLoading(false);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error("Anonymous auth failed:", e);
          setIsSystemLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);
  const [performanceSubjectFilter, setPerformanceSubjectFilter] = useState<string>('all');
  const [performanceAssessmentFilter, setPerformanceAssessmentFilter] = useState<string>('all');
  
  // Local state for Marksheet filters to prevent "glitches" (live re-renders while typing)
  const [marksheetLocalSearch, setMarksheetLocalSearch] = useState('');
  const [marksheetLocalGroup, setMarksheetLocalGroup] = useState<string>('all');
  const [marksheetLocalAssessment, setMarksheetLocalAssessment] = useState<string>('all');
  
  const [marksheetSearchQuery, setMarksheetSearchQuery] = useState('');
  const [marksheetGroupFilter, setMarksheetGroupFilter] = useState<string>('all');
  const [marksheetAppliedAssessmentFilter, setMarksheetAppliedAssessmentFilter] = useState<string>('all');
  
  const applyMarksheetFilters = () => {
    setMarksheetSearchQuery(marksheetLocalSearch);
    setMarksheetGroupFilter(marksheetLocalGroup);
    setPerformanceAssessmentFilter(marksheetLocalAssessment);
  };

  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [ibLevelFilter, setIbLevelFilter] = useState<'all' | 'HL' | 'SL'>('all');
  const [modalGroupFilter, setModalGroupFilter] = useState<string>('all');
  const [marksLevelFilter, setMarksLevelFilter] = useState<'all' | 'HL' | 'SL'>('all');
  const [selectedStudentForPerformance, setSelectedStudentForPerformance] = useState<string | 'none'>('none');
  const [performanceDisplayMode, setPerformanceDisplayMode] = useState<'percentage' | 'points'>('percentage');

  const gradeToPoints = (grade: string) => {
    if (!grade) return 0;
    const cleanGrade = grade.trim().toUpperCase();
    
    // First try standard numeric parsing (for 1-9, level 1-7, etc.)
    const num = parseInt(cleanGrade);
    if (!isNaN(num) && /^\d+$/.test(cleanGrade)) return num;
    
    // Comprehensive mapping for different curriculum scales
    const mapping: Record<string, number> = {
      // Alphabetic to Numeric (9-1 equivalent scale)
      'A*': 9, 'A': 8, 'B': 7, 'C': 6, 'D': 5, 'E': 4, 'F': 3, 'G': 2, 'U': 0, 'X': 0,
      'A+': 9, 'A-': 7.5, 'B+': 7, 'B-': 5.5, 'C+': 5, 'C-': 3.5,
      
      // IGCSE / GCSE Legacy
      'A_STAR': 9, 'A* ': 9, 
      
      // Primary / Assessment for Learning scales
      'OUTSTANDING': 6, 'SIGNIFICANTLY ABOVE': 5, 'ABOVE': 4, 'AT': 3, 'BELOW': 2, 'SIGNIFICANTLY BELOW': 1,
      'EXCEEDING': 6, 'EXPECTED': 3, 'WORKING TOWARDS': 1,
      'WA': 7, 'WTG': 5, 'BLW': 3,
      
      // IB scales (if they happen to be mixed)
      '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2, '1': 1
    };
    
    // Handle split grades (e.g., A/B or A*/A)
    if (cleanGrade.includes('/')) {
      const parts = cleanGrade.split('/');
      const values = parts.map(p => gradeToPoints(p.trim())).filter(v => v > 0);
      if (values.length > 0) {
        return values.reduce((a, b) => a + b, 0) / values.length;
      }
    }
    
    return mapping[cleanGrade] || 0;
  };

  const getStudentBoundaries = (student: Student, assessment?: Assessment) => {
    // 1. Priority: Assessment Specific Boundaries
    if (assessment?.boundaries && assessment.boundaries.length > 0) {
      return assessment.boundaries;
    }

    const studentYearNorm = normYear(student.yearGroup);
    const assessmentYearNorm = assessment ? normYear(assessment.yearGroup) : null;
    
    // Determine effective level: student's level or assessment's level as fallback
    const effectiveLevel = student.ibLevel || assessment?.ibLevel;

    // Normalize logic for determining IB vs IGCSE vs KS3
    const isIB = studentYearNorm.includes('ib') || (student.groupName || '').toUpperCase().includes('IB') || studentYearNorm.startsWith('12') || studentYearNorm.startsWith('13');
    const isIGCSE = studentYearNorm.includes('igcse') || (student.groupName || '').toUpperCase().includes('IGCSE') || studentYearNorm.startsWith('10') || studentYearNorm.startsWith('11');
    
    // Normalize yearKey: "12IB" -> "12 IB"
    const yearKeyRaw = String(student.yearGroup || '').trim();
    const yearKey = yearKeyRaw.replace(/^(\d+)([a-zA-Z]+)$/, '$1 $2');
    
    // Helper to find a key in yearBoundaries with normalization
    const findInYearBoundaries = (queryKey: string | null) => {
      if (!queryKey) return null;
      // Exact match
      if (yearBoundaries[queryKey] && yearBoundaries[queryKey].length > 0) return yearBoundaries[queryKey];
      
      const queryNorm = normYear(queryKey);
      
      // Special check: If it matches a canonical year group key (e.g. "12 IB"), prefer that
      const canonicalKeys = ['12 IB', '13 IB', '10 IGCSE', '11 IGCSE', '7', '8', '9'];
      const canonical = canonicalKeys.find(ck => normYear(ck) === queryNorm);
      if (canonical && yearBoundaries[canonical] && yearBoundaries[canonical].length > 0) {
        return yearBoundaries[canonical];
      }

      const matchedKey = Object.keys(yearBoundaries).find(k => normYear(k) === queryNorm);
      return (matchedKey && yearBoundaries[matchedKey] && yearBoundaries[matchedKey].length > 0) ? yearBoundaries[matchedKey] : null;
    };

    // 2. Resolve lookup keys in order of specificity
    const groupName = (student.groupName || '').trim();
    const lookupPriorities = [
      groupName, // e.g. "12C"
    ];

    // Level-specific IB keys (HL/SL)
    if (isIB && effectiveLevel && effectiveLevel !== 'Both') {
      const levelPrefix = yearKey.includes('IB') ? yearKey : yearKey + ' IB';
      lookupPriorities.push(`${levelPrefix} ${effectiveLevel}`);
      lookupPriorities.push(`${yearKeyRaw} ${effectiveLevel}`);
      if (yearKey.startsWith('12')) lookupPriorities.push(`12 IB ${effectiveLevel}`);
      if (yearKey.startsWith('13')) lookupPriorities.push(`13 IB ${effectiveLevel}`);
    }

    // Standard year group keys
    lookupPriorities.push(isIB ? (yearKey.includes('IB') ? yearKey : yearKey + ' IB') : null);
    lookupPriorities.push(isIGCSE ? (yearKey.includes('IGCSE') ? yearKey : yearKey + ' IGCSE') : null);
    lookupPriorities.push(yearKey);
    lookupPriorities.push(yearKeyRaw);

    for (const key of lookupPriorities) {
      const b = findInYearBoundaries(key);
      if (b && b.length > 0) return b;
    }

    // 3. Fallback to global defaults if no custom boundaries found
    if (isIGCSE) return IGCSE_BOUNDARIES;
    if (isIB) return IB_BOUNDARIES;
    return KS3_BOUNDARIES;
  };

  const getGrade = (percentage: number, boundaries: GradeBoundary[]) => {
    if (!boundaries || boundaries.length === 0) return 'U';
    const sorted = [...boundaries].sort((a, b) => b.minPercentage - a.minPercentage);
    for (const b of sorted) {
      if (percentage >= b.minPercentage) return b.grade;
    }
    return 'U';
  };

  const getMarkPercentage = (mark: Mark | undefined, assessment: Assessment | undefined): number => {
    if (!mark || !assessment) return 0;
    const score = Number(mark.score) || 0;
    const maxMarks = Number(assessment.maxMarks) || 100;
    const basePerc = (score / maxMarks) * 100;

    if (mark.resitScore !== undefined && mark.resitScore !== null) {
      const resitScore = Number(mark.resitScore);
      const resitMax = Number(mark.resitMaxMarks || assessment.maxMarks || 100);
      const resitPerc = (resitScore / resitMax) * 100;
      return (basePerc + resitPerc) / 2;
    }
    return basePerc;
  };
  const [showPaperGradingModal, setShowPaperGradingModal] = useState<string | null>(null);
  const [extractionMode, setExtractionMode] = useState<'questions' | 'subparts'>('questions');
  const [marksheetSort, setMarksheetSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'level', direction: 'asc' });
  const [marksheetEditMode, setMarksheetEditMode] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [useCloudSync, setUseCloudSync] = useState<boolean>(() => {
    const saved = localStorage.getItem('science-tracker-use-cloud');
    return saved === null ? true : saved === 'true';
  });
  const isFetching = React.useRef(false);
  const lastSyncedConfigRef = React.useRef<string>("");

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['year-7'])); // Default Year 7 expanded

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  useEffect(() => {
    if (groupFilter !== 'all') {
      // Find which year this group belongs to and auto-expand
      const student = students.find(s => s.groupName === groupFilter && s.academicYear === selectedAcademicYear);
      if (student) {
        const yearSectionId = `year-${student.yearGroup}`;
        const groupSectionId = `group-${student.yearGroup}-${groupFilter}`;
        setExpandedSections(prev => {
          const next = new Set(prev);
          next.add(yearSectionId);
          next.add(groupSectionId);
          return next;
        });
      }
    }
  }, [groupFilter, students, selectedAcademicYear]);

  // Auto-expand the selected year section in the sidebar
  useEffect(() => {
    if (yearFilter !== 'all' && yearFilter !== 'IGCSE_ALL' && yearFilter !== 'IB_ALL') {
      setExpandedSections(prev => {
        const next = new Set(prev);
        next.add(`year-${yearFilter}`);
        return next;
      });
    }
  }, [yearFilter]);

  // Reset modal filters when modals are closed
  useEffect(() => {
    if (!showMarksModal) {
      setMarksGroupFilter('all');
      setMarksLevelFilter('all');
    }
  }, [showMarksModal]);

  useEffect(() => {
    if (!showPaperGradingModal) setModalGroupFilter('all');
  }, [showPaperGradingModal]);

  // #8: Escape key closes any open modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showBoundaryShare) { setShowBoundaryShare(null); return; }
      if (showMarksModal) { setShowMarksModal(null); return; }
      if (showPaperGradingModal) { setShowPaperGradingModal(null); return; }
      if (showAssessmentModal) { setShowAssessmentModal(false); setEditingAssessmentId(null); return; }
      if (showStudentModal) { setShowStudentModal(false); return; }
      if (showImportModal) { setShowImportModal(false); setPendingImport(null); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMarksModal, showPaperGradingModal, showAssessmentModal, showStudentModal, showImportModal, showBoundaryShare]);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      // Don't fetch until auth is confirmed and system config is loaded
      if (!auth.currentUser || isSystemLoading) return;
      
      isFetching.current = true;
      try {
        // --- DATA RECOVERY ---
        // Attempt to find any lost data in common localStorage keys
        const recoveryKeys = [
          'science-tracker-students', 'marks-data-students', 'students',
          'science-tracker-assessments', 'marks-data-assessments', 'assessments',
          'science-tracker-marks', 'marks-data-marks', 'marks',
          'science-tracker-groups', 'marks-data-groups', 'groups',
          'science-tracker-boundaries', 'yearBoundaries'
        ];
        
        const localData: Record<string, any> = {};
        recoveryKeys.forEach(key => {
          const val = localStorage.getItem(key);
          if (val) {
            try { localData[key] = JSON.parse(val); } catch(e) {}
          }
        });

        // Initialize state with recovered data if available
        if (localData['science-tracker-students'] || localData['marks-data-students'] || localData['students']) {
          const s = localData['science-tracker-students'] || localData['marks-data-students'] || localData['students'];
          if (Array.isArray(s)) {
            // Ensure all recovered students have an academic year
            setStudents(s.map(student => ({
              ...student,
              academicYear: student.academicYear || selectedAcademicYear || CURRENT_ACADEMIC_YEAR
            })));
          }
        }
        if (localData['science-tracker-assessments'] || localData['marks-data-assessments'] || localData['assessments']) {
          const a = localData['science-tracker-assessments'] || localData['marks-data-assessments'] || localData['assessments'];
          if (Array.isArray(a)) {
            // Ensure all recovered assessments have an academic year
            setAssessments(a.map(assessment => ({
              ...assessment,
              academicYear: assessment.academicYear || selectedAcademicYear || CURRENT_ACADEMIC_YEAR
            })));
          }
        }
        if (localData['science-tracker-marks'] || localData['marks-data-marks'] || localData['marks']) {
          const m = localData['science-tracker-marks'] || localData['marks-data-marks'] || localData['marks'];
          if (Array.isArray(m)) setMarks(m);
        }
        if (localData['science-tracker-groups'] || localData['marks-data-groups'] || localData['groups']) {
          const g = localData['science-tracker-groups'] || localData['marks-data-groups'] || localData['groups'];
          if (Array.isArray(g)) {
            // Ensure all recovered groups have an academic year
            setGroups(g.map(group => ({
              ...group,
              academicYear: group.academicYear || selectedAcademicYear || CURRENT_ACADEMIC_YEAR
            })));
          }
        }
        if (localData['science-tracker-boundaries'] || localData['yearBoundaries']) {
          const b = localData['science-tracker-boundaries'] || localData['yearBoundaries'];
          if (b && typeof b === 'object') setYearBoundaries(b as any);
        }

        if (useCloudSync) {
          console.log("Fetching data from Firebase...");
          const [fbStudents, fbAssessments, fbMarks, fbGroups, fbBoundaries] = await Promise.all([
            getStudents(),
            getAssessments(),
            getMarks(),
            getGroups(),
            getYearBoundaries()
          ]);
          
          if (fbStudents && fbStudents.length > 0) {
            setStudents(fbStudents);
          } else if (fbStudents && students.length > 0) {
            // If cloud is empty but we have local data, push local data to cloud
            console.log("Pushing local students to empty cloud...");
            Promise.all(students.map(s => fbAddStudent(s)));
          }

          if (fbAssessments && fbAssessments.length > 0) {
            setAssessments(fbAssessments);
          } else if (fbAssessments && assessments.length > 0) {
            console.log("Pushing local assessments to empty cloud...");
            Promise.all(assessments.map(a => fbAddAssessment(a)));
          }

          if (fbMarks && fbMarks.length > 0) {
            const uniqueMarks: Mark[] = [];
            const markKeys = new Set<string>();
            fbMarks.forEach(m => {
              const key = `${m.studentId}_${m.assessmentId}`;
              if (!markKeys.has(key)) {
                markKeys.add(key);
                uniqueMarks.push(m);
              }
            });
            setMarks(uniqueMarks);
          } else if (fbMarks && marks.length > 0) {
            console.log("Pushing local marks to empty cloud...");
            Promise.all(marks.map(m => fbSetMark(m)));
          }

          if (fbGroups && fbGroups.length > 0) {
            setGroups(fbGroups);
          } else if (fbGroups && groups.length > 0) {
            console.log("Pushing local groups to empty cloud...");
            Promise.all(groups.map(g => fbAddGroup(g)));
          }
          if (fbBoundaries) {
            lastSyncedConfigRef.current = JSON.stringify(fbBoundaries);
            if (fbBoundaries.boundaries) setYearBoundaries(fbBoundaries.boundaries);
            if (fbBoundaries.locks) setLockedYearBoundaries(fbBoundaries.locks);
          }
          
          console.log("Cloud data synced.");
        }
      } catch (error) {
        console.error("Failed to fetch/sync data:", error);
      } finally {
        isFetching.current = false;
        setIsInitialLoading(false);
        setHasLoaded(true);
      }
    };
    fetchData();

    // Fallback: ensure app loads even if data fetch hangs
    const fallbackTimer = setTimeout(() => {
      setIsInitialLoading(false);
      setHasLoaded(true);
    }, 5000);

    return () => clearTimeout(fallbackTimer);
  }, [useCloudSync, isSystemLoading]);

  // Real-time Sync Effect
  useEffect(() => {
    if (!useCloudSync || !auth.currentUser || isSystemLoading || !hasLoaded) return;

    console.log("Setting up real-time sync with Firebase...");
    
    const unsubStudents = subscribeToData('students', (data) => {
      setStudents(data);
    });
    
    const unsubAssessments = subscribeToData('assessments', (data) => {
      setAssessments(data);
    });
    
    const unsubMarks = subscribeToData('marks', (mData) => {
      if (!mData) return;
      const uniqueMarks: Mark[] = [];
      const markKeys = new Set<string>();
      mData.forEach(m => {
        const key = `${m.studentId}_${m.assessmentId}`;
        if (!markKeys.has(key)) {
          markKeys.add(key);
          uniqueMarks.push(m);
        }
      });
      setMarks(uniqueMarks);
    });
    
    const unsubGroups = subscribeToData('groups', (data) => {
      setGroups(data);
    });

    const unsubConfig = subscribeToConfig((data) => {
      if (data) {
        lastSyncedConfigRef.current = JSON.stringify(data);
        if (data.boundaries) setYearBoundaries(data.boundaries);
        if (data.locks) setLockedYearBoundaries(data.locks);
      }
    });

    return () => {
      console.log("Cleaning up real-time subscripitons...");
      unsubStudents();
      unsubAssessments();
      unsubMarks();
      unsubGroups();
      unsubConfig();
    };
  }, [useCloudSync, auth.currentUser, isSystemLoading, hasLoaded]);

  // Save data locally when state changes
  useEffect(() => {
    if (!hasLoaded || isFetching.current) return;

    try {
      localStorage.setItem('science-tracker-students', JSON.stringify(students));
      localStorage.setItem('science-tracker-assessments', JSON.stringify(assessments));
      localStorage.setItem('science-tracker-marks', JSON.stringify(marks));
      localStorage.setItem('science-tracker-groups', JSON.stringify(groups));
      localStorage.setItem('science-tracker-boundaries', JSON.stringify(yearBoundaries));
      localStorage.setItem('science-tracker-use-cloud', String(useCloudSync));
    } catch (e) {}
  }, [students, assessments, marks, groups, yearBoundaries, hasLoaded, useCloudSync]);

  // Sync Shared Config to Cloud
  useEffect(() => {
    if (!hasLoaded || !useCloudSync || isFetching.current || !auth.currentUser) return;

    const currentConfigObj = {
      boundaries: yearBoundaries,
      locks: lockedYearBoundaries
    };
    const currentConfigStr = JSON.stringify(currentConfigObj);
    
    // Only save if different from what's on the server
    if (currentConfigStr === lastSyncedConfigRef.current) return;

    const saveConfig = async () => {
      setSaveStatus('saving');
      try {
        await updateYearBoundaries(currentConfigObj);
        lastSyncedConfigRef.current = currentConfigStr;
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (error) {
        console.error("Failed to save config to Cloud:", error);
        setSaveStatus('idle');
      }
    };

    const timer = setTimeout(saveConfig, 1000);
    return () => clearTimeout(timer);
  }, [yearBoundaries, lockedYearBoundaries, hasLoaded, useCloudSync]);

  // Reset subject filter if not available in new year group
  useEffect(() => {
    if (performanceSubjectFilter === 'all') return;
    
    const availableSubjects = Array.from(new Set(
      yearFilter === 'all' ? Object.values(SUBJECTS_BY_YEAR).flat() :
      yearFilter === 'IGCSE_ALL' ? [...SUBJECTS_BY_YEAR['10 IGCSE'], ...SUBJECTS_BY_YEAR['11 IGCSE']] :
      yearFilter === 'IB_ALL' ? [...SUBJECTS_BY_YEAR['12 IB'], ...SUBJECTS_BY_YEAR['13 IB']] :
      SUBJECTS_BY_YEAR[yearFilter as YearGroup] || []
    ));

    if (!availableSubjects.includes(performanceSubjectFilter)) {
      setPerformanceSubjectFilter('all');
    }
  }, [yearFilter]);

  // Reset IB Level filter if not an IB year
  useEffect(() => {
    if (!(String(yearFilter).includes('IB') || yearFilter === 'IB_ALL')) {
      setIbLevelFilter('all');
    }
  }, [yearFilter]);

  // Helper for year group display
  const formatYearGroup = (y: YearGroup) => {
    return typeof y === 'number' ? `Year ${y}` : y;
  };

  const migrateYear = (y: any): YearGroup => {
    if (y === 10 || y === '10') return '10 IGCSE';
    if (y === 11 || y === '11') return '11 IGCSE';
    if (y === 12 || y === '12') return '12 IB';
    if (y === 13 || y === '13') return '13 IB';
    // Normalise string "7","8","9" back to numbers as per YearGroup type
    if (y === '7') return 7;
    if (y === '8') return 8;
    if (y === '9') return 9;
    return y as YearGroup;
  };

  const cleanFirestoreData = (data: any) => {
    const clean: any = {};
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        if (data[key] !== null && typeof data[key] === 'object' && !Array.isArray(data[key])) {
          clean[key] = cleanFirestoreData(data[key]);
        } else {
          clean[key] = data[key];
        }
      }
    });
    return clean;
  };

  // Helper for year group matching
  const matchesYearFilter = (itemYear: YearGroup, filter: YearGroup | 'all' | 'IGCSE_ALL' | 'IB_ALL') => {
    if (filter === 'all') return itemYear !== 'Graduated';
    const itemNorm = normYear(itemYear);
    const filterNorm = normYear(filter);
    if (filter === 'IGCSE_ALL') return itemNorm.includes('igcse') || itemNorm.startsWith('10') || itemNorm.startsWith('11');
    if (filter === 'IB_ALL') return itemNorm.includes('ib') || itemNorm.startsWith('12') || itemNorm.startsWith('13');
    return itemNorm === filterNorm;
  };

  // Data Migration for old year formats
  useEffect(() => {
    const migratedStudents = students.map(s => ({ ...s, yearGroup: migrateYear(s.yearGroup) }));
    if (JSON.stringify(migratedStudents) !== JSON.stringify(students)) {
      setStudents(migratedStudents);
    }

    const migratedAssessments = assessments.map(a => ({ ...a, yearGroup: migrateYear(a.yearGroup) }));
    if (JSON.stringify(migratedAssessments) !== JSON.stringify(assessments)) {
      setAssessments(migratedAssessments);
    }

    // Also migrate groups yearGroup field
    const migratedGroups = groups.map(g => ({ ...g, yearGroup: migrateYear(g.yearGroup) }));
    if (JSON.stringify(migratedGroups) !== JSON.stringify(groups)) {
      setGroups(migratedGroups);
    }
  }, [students, assessments, groups]);

  // Cleanup orphaned groups (groups with no students) from Firestore and local state
  // Runs across ALL academic years so old ghost groups get purged regardless of selected year
  useEffect(() => {
    if (!hasLoaded || groups.length === 0) return;
    // Build a key set from ALL students across all years
    const studentGroupKeys = new Set(
      students.map(s => `${String(s.yearGroup)}|${s.groupName}|${s.academicYear}`)
    );
    const orphanedGroups = groups.filter(g => 
      !studentGroupKeys.has(`${String(g.yearGroup)}|${g.name}|${g.academicYear}`)
    );
    if (orphanedGroups.length > 0) {
      console.log(`Cleaning up ${orphanedGroups.length} orphaned group(s):`, orphanedGroups.map(g => g.name));
      setGroups(prev => prev.filter(g => 
        studentGroupKeys.has(`${String(g.yearGroup)}|${g.name}|${g.academicYear}`)
      ));
      // Delete from Firestore permanently
      orphanedGroups.forEach(g => {
        deleteDoc(doc(db, 'groups', g.id)).catch(console.error);
      });
    }
  }, [hasLoaded, students, groups]);

  // Derived Data
  const performances = useMemo(() => {
    const rawStudents = students.filter(s => s.academicYear === selectedAcademicYear);
    
    const currentYearStudents = rawStudents;
    const currentYearAssessments = assessments.filter(a => a.academicYear === selectedAcademicYear);

    return currentYearStudents.map(student => {
      // Find previous year records and marks for this student
      // This fulfills the requirement: "year 10 moves to year 11, year 12 to year 13 along with all their data"
      let priorMarks: (Mark & { assessment: Assessment })[] = [];
      
      const prevYear = getPreviousAcademicYear(selectedAcademicYear);
      const isProgressionYear = student.yearGroup === '11 IGCSE' || student.yearGroup === '13 IB' || student.yearGroup === 'Graduated' || student.yearGroup === '12 IB';
      
      if (prevYear && isProgressionYear) {
        const prevYearGroup = student.yearGroup === '11 IGCSE' ? '10 IGCSE' : 
                             student.yearGroup === '13 IB' ? '12 IB' : 
                             student.yearGroup === '12 IB' ? '11 IGCSE' : '13 IB';
        
        // Lookup marks from a different student record with same name
        const prevStudent = students.find(s => s.name === student.name && s.yearGroup === prevYearGroup && s.academicYear === prevYear);
        if (prevStudent) {
          const prevAssessments = assessments.filter(a => a.academicYear === prevYear && a.yearGroup === prevYearGroup);
          priorMarks = marks
            .filter(m => m.studentId === prevStudent.id)
            .map(m => ({
              ...m,
              assessment: prevAssessments.find(a => a.id === m.assessmentId)!
            }))
            .filter(m => m.assessment);
        }
        
        // ALSO: Check marks for THIS student ID that belong to the previous year group assessments
        // (This handles cases where the student was "Moved" to the new year but their old marks are still there)
        const historicMarks = marks
          .filter(m => m.studentId === student.id)
          .map(m => ({
            ...m,
            assessment: assessments.find(a => (a.id === m.assessmentId || a.id === m.id) && a.academicYear === prevYear)!
          }))
          .filter(m => m.assessment && m.assessment.academicYear === prevYear);
        
        // Merge without duplicates
        const existingMarkIds = new Set(priorMarks.map(m => m.id));
        historicMarks.forEach(hm => {
          if (!existingMarkIds.has(hm.id)) {
            priorMarks.push(hm);
          }
        });
      }

      const studentMarks = [
        ...priorMarks,
        ...marks
          .filter(m => m.studentId === student.id)
          .map(m => ({
            ...m,
            assessment: currentYearAssessments.find(a => a.id === m.assessmentId)!
          }))
          .filter(m => {
            if (!m.assessment) return false;
            const levelMatch = !m.assessment.ibLevel || m.assessment.ibLevel === 'Both' || m.assessment.ibLevel === student.ibLevel;
            const assessmentMatch = performanceAssessmentFilter === 'all' || m.assessmentId === performanceAssessmentFilter;
            return levelMatch && assessmentMatch;
          })
      ].sort((a, b) => new Date(a.assessment.date).getTime() - new Date(b.assessment.date).getTime());

      // Only include marks where the student actually sat the assessment (not absent)
      const sittingMarks = studentMarks.filter(m => !(m as any).absent);
      const absentCount = studentMarks.length - sittingMarks.length;

      const totalPercentage = sittingMarks.reduce((acc, m) => acc + getMarkPercentage(m, m.assessment), 0);
      const averagePercentage = sittingMarks.length > 0 ? totalPercentage / sittingMarks.length : null;

      // Calculate Average Points
      const marksWithPoints = sittingMarks.map(m => {
        const effPerc = getMarkPercentage(m, m.assessment);
        const boundaries = getStudentBoundaries(student, m.assessment);
        const grade = getGrade(effPerc, boundaries);
        return gradeToPoints(grade);
      });
      const averagePoints = marksWithPoints.length > 0 ? marksWithPoints.reduce((s, p) => s + p, 0) / marksWithPoints.length : (averagePercentage !== null ? gradeToPoints(getGrade(averagePercentage, getStudentBoundaries(student))) : null);

      // Trend: only from assessments the student sat, need at least 2
      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (sittingMarks.length >= 2) {
        const last = getMarkPercentage(sittingMarks[sittingMarks.length - 1], sittingMarks[sittingMarks.length - 1].assessment);
        const prev = getMarkPercentage(sittingMarks[sittingMarks.length - 2], sittingMarks[sittingMarks.length - 2].assessment);
        if (last > prev + 2) trend = 'improving';
        else if (last < prev - 2) trend = 'declining';
      }

      // Status: only meaningful if student has sat at least 1 assessment
      let status: 'excellent' | 'on-track' | 'needs-improvement' | 'no-data' = averagePercentage === null ? 'no-data' : 'on-track';
      if (averagePercentage !== null) {
        const currentBoundaries = getStudentBoundaries(student);
        const sortedBoundaries = [...currentBoundaries].sort((a, b) => b.minPercentage - a.minPercentage);
        const topBoundary = sortedBoundaries[0]?.minPercentage || 80;
        
        // Define "Fail Range" thresholds based on year group
        let supportThreshold = 50; // Default (KS3 "At" boundary)
        if (String(student.yearGroup).includes('IB')) {
          // Trigger support if below Grade 5 (i.e., at 4 or lower)
          supportThreshold = sortedBoundaries.find(b => b.grade === '5')?.minPercentage || 70;
        } else if (String(student.yearGroup).includes('IGCSE')) {
          // Trigger support if below Grade 5 (i.e., at 4 or lower)
          supportThreshold = sortedBoundaries.find(b => b.grade === '5')?.minPercentage || 50;
        } else {
          // KS3: Trigger support if below "At" grade
          supportThreshold = sortedBoundaries.find(b => b.grade === 'At')?.minPercentage || 50;
        }

        if (averagePercentage >= topBoundary) {
          status = 'excellent';
        } else if (averagePercentage < supportThreshold) {
          // If significantly below threshold OR declining and just below
          status = 'needs-improvement';
        } else if (trend === 'declining' && averagePercentage < supportThreshold + 5) {
          // "At Risk" but still officially on track for now by status string logic
          // You could add an 'at-risk' status if desired
          status = 'on-track';
        }
      }

      const currentGrade = averagePercentage !== null ? getGrade(averagePercentage, getStudentBoundaries(student)) : 'U';
      const currentPoints = gradeToPoints(currentGrade);
      const baselinePoints = student.baselineGrade ? gradeToPoints(student.baselineGrade) : null;
      const isConcern = baselinePoints !== null && averagePercentage !== null && (currentPoints <= baselinePoints - 3);

      return {
        student,
        marks: studentMarks,       // all marks including absent (for display)
        sittingMarks,              // marks where student actually sat (for calculations)
        absentCount,
        averagePercentage: averagePercentage ?? 0, // 0 for type compat, use status==='no-data' to distinguish
        averagePoints: averagePoints ?? 0,
        hasData: averagePercentage !== null,
        trend,
        status,
        isConcern,
        baselinePoints
      } as any as StudentPerformance;
    });
  }, [students, assessments, marks, selectedAcademicYear, yearBoundaries, performanceSubjectFilter, performanceAssessmentFilter]);

  const filteredPerformances = useMemo(() => {
    return performances.filter(p => {
      const activeSearch = searchQuery || marksheetSearchQuery;
      const matchesSearch = p.student.name.toLowerCase().includes(activeSearch.toLowerCase());
      const matchesYear = matchesYearFilter(p.student.yearGroup, yearFilter);
      const matchesGroup = marksheetGroupFilter === 'all' || p.student.groupName === marksheetGroupFilter;
      // Subject filter logic:
      // 1. If student has a subjects[] field (from import), use it directly
      // 2. For Years 7-9, all students take all subjects for their year (Computer Science)
      // 3. For Years 10-13, check marks if no subjects field set
      const studentSubjects: string[] = (p.student as any).subjects?.length
        ? (p.student as any).subjects
        : SUBJECTS_BY_YEAR[p.student.yearGroup] || [];
      const matchesSubject = performanceSubjectFilter === 'all' || 
        studentSubjects.includes(performanceSubjectFilter) || 
        p.marks.some(m => m.assessment.subject === performanceSubjectFilter);
      const matchesLevel = ibLevelFilter === 'all' || p.student.ibLevel === ibLevelFilter;
      return matchesSearch && matchesYear && matchesGroup && matchesSubject && matchesLevel;
    });
  }, [performances, marksheetSearchQuery, searchQuery, yearFilter, performanceSubjectFilter, marksheetGroupFilter, ibLevelFilter]);

  const sortedMarksheetPerformances = useMemo(() => {
    return [...filteredPerformances].sort((a, b) => {
      const isIB = a.student.yearGroup === '12 IB' || a.student.yearGroup === '13 IB' || 
                   b.student.yearGroup === '12 IB' || b.student.yearGroup === '13 IB';

      if (marksheetSort.key === 'level' && isIB) {
        // IB Sort: HL then SL, then Name
        const levelOrder = { 'HL': 0, 'SL': 1, 'undefined': 2 };
        const levelA = a.student.ibLevel || 'undefined';
        const levelB = b.student.ibLevel || 'undefined';
        
        if (levelOrder[levelA] !== levelOrder[levelB]) {
          return marksheetSort.direction === 'asc' 
            ? levelOrder[levelA] - levelOrder[levelB]
            : levelOrder[levelB] - levelOrder[levelA];
        }
        return a.student.name.localeCompare(b.student.name);
      }

      if (marksheetSort.key === 'name') {
        return marksheetSort.direction === 'asc' 
          ? a.student.name.localeCompare(b.student.name)
          : b.student.name.localeCompare(a.student.name);
      }

      if (marksheetSort.key === 'avg') {
        return marksheetSort.direction === 'asc'
          ? a.averagePercentage - b.averagePercentage
          : b.averagePercentage - a.averagePercentage;
      }

      if (marksheetSort.key === 'gp') {
        return marksheetSort.direction === 'asc'
          ? a.averagePoints - b.averagePoints
          : b.averagePoints - a.averagePoints;
      }

      if (marksheetSort.key === 'grade') {
        const gradeA = getGrade(a.averagePercentage, getStudentBoundaries(a.student));
        const gradeB = getGrade(b.averagePercentage, getStudentBoundaries(b.student));
        return marksheetSort.direction === 'asc'
          ? gradeA.localeCompare(gradeB)
          : gradeB.localeCompare(gradeA);
      }

      // Default sort (by level if IB, else name)
      return a.student.name.localeCompare(b.student.name);
    });
  }, [filteredPerformances, marksheetSort]);

  const availableGroups = useMemo(() => {
    const currentYearStudents = students.filter(s => s.academicYear === selectedAcademicYear);
    let filtered = currentYearStudents.filter(s => matchesYearFilter(s.yearGroup, yearFilter));
    if (ibLevelFilter !== 'all') {
      filtered = filtered.filter(s => s.ibLevel === ibLevelFilter);
    }
    // Only show groups that actually have students - prevents ghost/deleted groups from appearing
    return Array.from(new Set(filtered.map(s => s.groupName))).filter(Boolean).sort();
  }, [students, selectedAcademicYear, yearFilter, ibLevelFilter]);

  const availablePerformanceSubjects = useMemo(() => {
    if (yearFilter === 'all') {
      return Array.from(new Set(Object.values(SUBJECTS_BY_YEAR).flat())).sort();
    }
    if (yearFilter === 'IGCSE_ALL') {
      return Array.from(new Set([...(SUBJECTS_BY_YEAR['10 IGCSE'] || []), ...(SUBJECTS_BY_YEAR['11 IGCSE'] || [])])).sort();
    }
    if (yearFilter === 'IB_ALL') {
      return Array.from(new Set([...(SUBJECTS_BY_YEAR['12 IB'] || []), ...(SUBJECTS_BY_YEAR['13 IB'] || [])])).sort();
    }
    return [...(SUBJECTS_BY_YEAR[yearFilter as YearGroup] || [])].sort();
  }, [yearFilter]);

  const availablePerformanceAssessments = useMemo(() => {
    return assessments
      .filter(a => a.academicYear === selectedAcademicYear && matchesYearFilter(a.yearGroup, yearFilter))
      .filter(a => performanceSubjectFilter === 'all' || a.subject === performanceSubjectFilter)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [assessments, selectedAcademicYear, yearFilter, performanceSubjectFilter]);

  const topPerformers = useMemo(() => {
    return [...filteredPerformances]
      .filter(p => (p as any).hasData && p.status !== 'needs-improvement') // exclude struggling students from top performers
      .sort((a, b) => b.averagePercentage - a.averagePercentage)
      .slice(0, 5);
  }, [filteredPerformances]);

  const needsSupport = useMemo(() => {
    return [...filteredPerformances]
      .filter(p => p.hasData && p.status === 'needs-improvement')
      .sort((a, b) => a.averagePercentage - b.averagePercentage)
      .slice(0, 5);
  }, [filteredPerformances]);

  const performanceTabStats = useMemo(() => {
    const rawStudents = students.filter(s => s.academicYear === selectedAcademicYear);
    
    // De-duplicate by name and year group to handle data replication issues
    const currentYearStudents: Student[] = [];
    const seenNames = new Set<string>();
    
    // Sort to prefer versions with groupName
    const sortedRaw = [...rawStudents].sort((a, b) => {
      if (a.groupName && !b.groupName) return -1;
      if (!a.groupName && b.groupName) return 1;
      return 0;
    });

    for (const s of sortedRaw) {
      const key = `${s.name.toLowerCase()}|${normYear(s.yearGroup)}`;
      if (!seenNames.has(key)) {
        currentYearStudents.push(s);
        seenNames.add(key);
      }
    }

    const currentYearAssessments = assessments.filter(a => a.academicYear === selectedAcademicYear);

    return currentYearStudents.map(student => {
      const allStudentMarks = marks
        .filter(m => m.studentId === student.id)
        .map(m => ({
          ...m,
          assessment: currentYearAssessments.find(a => a.id === m.assessmentId)!
        }))
        .filter(m => {
          if (!m.assessment) return false;
          const subjectMatches = performanceSubjectFilter === 'all' || m.assessment.subject === performanceSubjectFilter;
          const levelMatches = !m.assessment.ibLevel || m.assessment.ibLevel === 'Both' || m.assessment.ibLevel === student.ibLevel;
          const assessmentMatches = performanceAssessmentFilter === 'all' || m.assessmentId === performanceAssessmentFilter;
          return subjectMatches && levelMatches && assessmentMatches;
        })
        .filter(m => matchesYearFilter(m.assessment.yearGroup, yearFilter))
        .sort((a, b) => new Date(a.assessment.date).getTime() - new Date(b.assessment.date).getTime());

      // Only include marks where the student actually sat the assessment (not absent)
      const sittingMarks = allStudentMarks.filter(m => !(m as any).absent);

      const totalPercentage = sittingMarks.reduce((acc, m) => acc + getMarkPercentage(m, m.assessment), 0);
      const averagePercentage = sittingMarks.length > 0 ? totalPercentage / sittingMarks.length : 0;

      // Calculate Average Points
      const marksWithPoints = sittingMarks.map(m => {
        const effPerc = getMarkPercentage(m, m.assessment);
        const boundaries = getStudentBoundaries(student);
        const grade = getGrade(effPerc, boundaries);
        return gradeToPoints(grade);
      });
      const averagePoints = marksWithPoints.length > 0 ? marksWithPoints.reduce((s, p) => s + p, 0) / marksWithPoints.length : gradeToPoints(getGrade(averagePercentage, getStudentBoundaries(student)));

      // Trend: only from assessments the student sat, need at least 2
      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (sittingMarks.length >= 2) {
        const last = getMarkPercentage(sittingMarks[sittingMarks.length - 1], sittingMarks[sittingMarks.length - 1].assessment);
        const prev = getMarkPercentage(sittingMarks[sittingMarks.length - 2], sittingMarks[sittingMarks.length - 2].assessment);
        if (last > prev + 2) trend = 'improving';
        else if (last < prev - 2) trend = 'declining';
      }

      // Status logic
      let status: 'excellent' | 'on-track' | 'needs-improvement' | 'no-data' = sittingMarks.length === 0 ? 'no-data' : 'on-track';
      if (sittingMarks.length > 0) {
        const currentBoundaries = getStudentBoundaries(student);
        const sortedBoundaries = [...currentBoundaries].sort((a, b) => b.minPercentage - a.minPercentage);
        const topBoundary = sortedBoundaries[0]?.minPercentage || 80;
        
        // Define "Fail Range" thresholds based on year group
        let supportThreshold = 50; // Default (KS3 "At" boundary)
        if (String(student.yearGroup).includes('IB')) {
          supportThreshold = sortedBoundaries.find(b => b.grade === '5')?.minPercentage || 70;
        } else if (String(student.yearGroup).includes('IGCSE')) {
          supportThreshold = sortedBoundaries.find(b => b.grade === '5')?.minPercentage || 50;
        } else {
          supportThreshold = sortedBoundaries.find(b => b.grade === 'At')?.minPercentage || 50;
        }

        if (averagePercentage >= topBoundary) {
          status = 'excellent';
        } else if (averagePercentage < supportThreshold) {
          status = 'needs-improvement';
        }
      }

      return {
        student,
        averagePercentage,
        averagePoints,
        trend,
        status,
        count: sittingMarks.length,         // only assessments actually sat
        totalCount: allStudentMarks.length,  // includes absent
        absentCount: allStudentMarks.length - sittingMarks.length,
        baselinePoints: student.baselineGrade ? gradeToPoints(student.baselineGrade) : null,
        isConcern: student.baselineGrade ? (averagePoints <= gradeToPoints(student.baselineGrade) - 3) : false,
        hasData: sittingMarks.length > 0
      };
    }).filter(p => p.count > 0); 
  }, [students, assessments, marks, performanceSubjectFilter, performanceAssessmentFilter, yearFilter, selectedAcademicYear, yearBoundaries]);

  const calculateGradeDistribution = (stats: any[]) => {
    const distribution: Record<string, number> = {};
    
    stats.forEach(p => {
      const boundaries = getStudentBoundaries(p.student);
      const grade = getGrade(p.averagePercentage, boundaries);
      distribution[grade] = (distribution[grade] || 0) + 1;
    });

    return Object.entries(distribution)
      .map(([grade, count]) => {
        let color = 'bg-blue-500';
        const g = grade.toUpperCase();
        if (g === '7' || g === '9' || g === 'A*' || g === 'EXCEEDING' || g === '8') color = 'bg-emerald-500';
        else if (g === 'U' || g === '1' || g === 'WORKING TOWARDS') color = 'bg-rose-500';
        else if (g === '2' || g === '3') color = 'bg-orange-500';
        else if (g === '5' || g === '6' || g === 'AT') color = 'bg-indigo-500';
        
        return {
          label: grade,
          count,
          color
        };
      })
      .sort((a, b) => {
        // Try to sort by numerical value or predefined order
        const order = ['9', '8', '7', '6', '5', '4', '3', '2', '1', 'U', 'A*', 'A', 'B', 'C', 'D', 'E', 'F', 'EXCEEDING', 'AT', 'WORKING TOWARDS'];
        const gradeA = a.label.toUpperCase();
        const gradeB = b.label.toUpperCase();
        const idxA = order.indexOf(gradeA);
        const idxB = order.indexOf(gradeB);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return b.count - a.count;
      });
  };

  const gradeDistribution = useMemo(() => {
    return calculateGradeDistribution(filteredPerformances);
  }, [filteredPerformances, yearBoundaries]);

  const performanceTabGradeDistribution = useMemo(() => {
    return calculateGradeDistribution(performanceTabStats);
  }, [performanceTabStats, yearBoundaries]);

  const topPerformersList = useMemo(() => {
    const dataKey = performanceDisplayMode === 'percentage' ? 'averagePercentage' : 'averagePoints';
    return [...performanceTabStats]
      .filter(p => p.status !== 'needs-improvement')
      .sort((a, b) => (b as any)[dataKey] - (a as any)[dataKey])
      .slice(0, 5);
  }, [performanceTabStats, performanceDisplayMode]);

  const needsSupportList = useMemo(() => {
    const dataKey = performanceDisplayMode === 'percentage' ? 'averagePercentage' : 'averagePoints';
    return [...performanceTabStats]
      .filter(p => p.status === 'needs-improvement')
      .sort((a, b) => (a as any)[dataKey] - (b as any)[dataKey])
      .slice(0, 5);
  }, [performanceTabStats, performanceDisplayMode]);

  const performanceTabAssessments = useMemo(() => {
    let filtered = assessments
      .filter(a => a.academicYear === selectedAcademicYear)
      .filter(a => matchesYearFilter(a.yearGroup, yearFilter))
      .filter(a => performanceSubjectFilter === 'all' || a.subject === performanceSubjectFilter);
    
    if (performanceAssessmentFilter !== 'all') {
      filtered = filtered.filter(a => a.id === performanceAssessmentFilter);
    }

    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [assessments, selectedAcademicYear, yearFilter, performanceSubjectFilter, performanceAssessmentFilter]);

  const downloadMarksheet = () => {
    const wb = XLSX.utils.book_new();
    
    // Prepare headers
    const headers = ['Student Name', 'Baseline Grade', 'Academic Year', 'Year Group', 'Class', 'Avg %', 'Avg Grade', 'Avg GP'];
    performanceTabAssessments.forEach(a => {
      headers.push(`${a.name} (Mark)`);
      headers.push(`${a.name} (%)`);
      headers.push(`${a.name} (Grade)`);
      headers.push(`${a.name} (GP)`);
    });

    // Prepare data
    const data = sortedMarksheetPerformances.map(p => {
      const row: any[] = [
        p.student.name,
        p.student.baselineGrade || '—',
        p.student.academicYear,
        p.student.yearGroup,
        p.student.groupName,
        p.averagePercentage.toFixed(1) + '%',
        getGrade(p.averagePercentage, getStudentBoundaries(p.student)),
        (p as any).hasData ? p.averagePoints.toFixed(2) : '—'
      ];

      performanceTabAssessments.forEach(a => {
        const mark = p.marks.find(m => m.assessmentId === a.id);
        if (mark) {
          if ((mark as any).absent) {
            row.push('ABS', 'ABS', 'ABS', 'ABS');
          } else {
            const effPerc = getMarkPercentage(mark, a);
            const grade = getGrade(effPerc, getStudentBoundaries(p.student, a));
            const points = gradeToPoints(grade);
            row.push(mark.score, effPerc.toFixed(1) + '%', grade, points);
          }
        } else {
          row.push('—', '—', '—', '—');
        }
      });
      return row;
    });

    const ws_data = [headers, ...data];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    
    // Auto-size columns
    const max_width = headers.map((h, i) => Math.max(h.length, ...data.map(r => String(r[i] || '').length)));
    ws['!cols'] = max_width.map(w => ({ wch: w + 2 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Marksheet');
    
    const fileName = `Marksheet_${yearFilter}_${groupFilter}_${selectedAcademicYear}.xlsx`.replace(/\s+/g, '_');
    XLSX.writeFile(wb, fileName);
  };

  const GroupDetailsModal = () => {
    if (!selectedGroupDetails) return null;

    const groupStudents = students.filter(s => 
      s.groupName === selectedGroupDetails.name && 
      s.academicYear === selectedGroupDetails.academicYear
    );

    const isGenericSheet = ['Sheet', 'book', 'Export', 'Untitled', 'Copy', 'Page'].some(name => 
      selectedGroupDetails.name.toLowerCase().includes(name.toLowerCase())
    );

    const availableGroups = groups.filter(g => g.id !== selectedGroupDetails.id);

    const groupPerformances = groupStudents.map(s => {
      const studentMarks = marks.filter(m => m.studentId === s.id);
      const studentAssessmentPerformances = studentMarks.map(m => {
        const assessment = assessments.find(a => a.id === m.assessmentId);
        if (!assessment) return null;
        
        const percentage = getMarkPercentage(m, assessment);
        
        return {
          percentage,
          points: gradeToPoints(getGrade(percentage, getStudentBoundaries(s)))
        };
      }).filter(Boolean) as { percentage: number, points: number }[];

      const hasData = studentAssessmentPerformances.length > 0;
      const avgPercentage = hasData
        ? studentAssessmentPerformances.reduce((acc, p) => acc + p.percentage, 0) / studentAssessmentPerformances.length
        : 0;
      
      const avgPoints = hasData
        ? studentAssessmentPerformances.reduce((acc, p) => acc + p.points, 0) / studentAssessmentPerformances.length
        : 0;

      return {
        student: s,
        avgPercentage,
        avgPoints,
        hasData,
        grade: hasData ? getGrade(avgPercentage, getStudentBoundaries(s)) : 'U'
      };
    }).sort((a, b) => b.avgPercentage - a.avgPercentage);

    const studentsWithData = groupPerformances.filter(p => p.hasData);
    const groupAvgPercentage = studentsWithData.length > 0
      ? studentsWithData.reduce((acc, p) => acc + p.avgPercentage, 0) / studentsWithData.length
      : 0;
    const groupAvgPoints = studentsWithData.length > 0
      ? studentsWithData.reduce((acc, p) => acc + p.avgPoints, 0) / studentsWithData.length
      : 0;

    const moveByLevel = async () => {
      const studentsToMove = groupStudents.filter(s => s.ibLevel);
      if (studentsToMove.length === 0) {
        alert("No students have HL/SL levels selected yet. Use the HL/SL buttons first.");
        return;
      }

      setSaveStatus('saving');
      let movedCount = 0;
      for (const s of studentsToMove) {
        const targetGroup = groups.find(g => 
          g.academicYear === selectedGroupDetails.academicYear && 
          g.name.toLowerCase().includes(s.ibLevel!.toLowerCase()) &&
          g.id !== selectedGroupDetails.id
        );
        if (targetGroup) {
          await fbUpdateStudent(s.id, { 
            groupName: targetGroup.name,
            yearGroup: targetGroup.yearGroup,
            academicYear: targetGroup.academicYear
          });
          movedCount++;
        }
      }
      
      if (movedCount > 0) {
        setStudents(prev => prev.map(s => {
          const matchingStudent = studentsToMove.find(m => m.id === s.id);
          if (matchingStudent) {
            const targetGroup = groups.find(g => 
              g.academicYear === selectedGroupDetails.academicYear && 
              g.name.toLowerCase().includes(matchingStudent.ibLevel!.toLowerCase()) &&
              g.id !== selectedGroupDetails.id
            );
            if (targetGroup) return { ...s, groupName: targetGroup.name, yearGroup: targetGroup.yearGroup };
          }
          return s;
        }));
        alert(`Successfully moved ${movedCount} students to their respective HL/SL groups.`);
      } else {
        alert("Could not find matching HL or SL groups to move students to. Please ensure your target groups have 'HL' or 'SL' in their names.");
      }
      setSaveStatus('idle');
    };

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 font-display">{selectedGroupDetails.name}</h3>
                <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest font-sans">
                  {String(selectedGroupDetails.yearGroup).includes('IB') ? 'IB DP' : 'IGCSE'} • {selectedGroupDetails.academicYear} • {groupStudents.length} Students
                </p>
              </div>
            </div>
            <button 
              onClick={() => setSelectedGroupDetails(null)}
              className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all font-sans"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 font-sans">
            <div className="mb-4 flex items-center justify-between gap-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Student Roster & Performance</span>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-2">
                  <Target className="w-3 h-3" />
                  Avg: {groupAvgPercentage.toFixed(1)}%
                </div>
                <div className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-2">
                  <Star className="w-3 h-3" />
                  Avg Grade: {getGrade(groupAvgPercentage, getStudentBoundaries(groupPerformances[0]?.student || students[0]))} ({groupAvgPoints.toFixed(1)} pts)
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              {groupPerformances.map((perf, idx) => (
                <div key={perf.student.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group/item hover:border-indigo-200 transition-all">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-300 w-4">{idx + 1}</span>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">{perf.student.name}</span>
                      {String(selectedGroupDetails.yearGroup).includes('IB') && (
                        <div className="flex gap-1 mt-1">
                          {['HL', 'SL'].map(level => (
                            <button
                              key={level}
                              onClick={() => {
                                fbUpdateStudent(perf.student.id, { ibLevel: level as any });
                                setStudents(prev => prev.map(s => s.id === perf.student.id ? { ...s, ibLevel: level as any } : s));
                              }}
                              className={`px-1.5 py-0.5 rounded text-[8px] font-black transition-all ${
                                perf.student.ibLevel === level 
                                  ? (level === 'HL' ? 'bg-violet-600 text-white' : 'bg-sky-600 text-white')
                                  : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                              }`}
                            >
                              {level}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
                      <select
                        onChange={(e) => {
                          const targetGroupId = e.target.value;
                          if (targetGroupId) {
                            moveStudentToGroup(perf.student.id, targetGroupId);
                          }
                        }}
                        className="text-[10px] bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-500"
                        value=""
                      >
                        <option value="">Move to...</option>
                        {availableGroups.length > 0 ? (
                          availableGroups.sort((a, b) => b.academicYear.localeCompare(a.academicYear)).map(g => (
                            <option key={g.id} value={g.id}>{g.name} ({g.academicYear})</option>
                          ))
                        ) : (
                          <option disabled>No other groups found</option>
                        )}
                      </select>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-slate-900">{perf.hasData ? `${perf.avgPercentage.toFixed(1)}%` : '—'}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Avg Score</p>
                    </div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${perf.hasData ? 'bg-white border-slate-200' : 'bg-slate-100 border-transparent text-slate-400'}`}>
                      <span className={`text-xs font-black ${perf.hasData ? 'text-indigo-600' : 'text-slate-400'}`}>{perf.grade}</span>
                    </div>
                  </div>
                </div>
              ))}
              {groupPerformances.length === 0 && (
                <div className="py-12 text-center">
                  <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-3xl inline-block mb-4">
                    <Users className="w-12 h-12 text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-bold mb-1">This group is empty</p>
                  <p className="text-slate-400 text-xs mb-8 italic">No students found assigned to this group in {selectedGroupDetails.academicYear}.</p>
                  
                  <button 
                    onClick={() => {
                      if (confirm(`Delete empty group "${selectedGroupDetails.name}"?`)) {
                        fbDeleteGroup(selectedGroupDetails.id);
                        setGroups(prev => prev.filter(g => g.id !== selectedGroupDetails.id));
                        setSelectedGroupDetails(null);
                      }
                    }}
                    className="px-6 py-2.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl text-xs font-black hover:bg-rose-100 transition-all flex items-center gap-2 mx-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Empty Group
                  </button>
                </div>
              )}
            </div>

            {availableGroups.length > 0 && groupStudents.length > 0 && (
              <div className="mt-8 space-y-3">
                {isGenericSheet && groupStudents.some(s => s.ibLevel) && (
                  <button
                    onClick={moveByLevel}
                    className="w-full p-4 bg-violet-50 border border-violet-100 rounded-2xl flex items-center justify-between hover:bg-violet-100 transition-all group"
                  >
                    <div className="text-left">
                      <p className="text-xs font-bold text-violet-900">Auto-Migrate by HL/SL Level</p>
                      <p className="text-[10px] text-violet-600">Move students based on their HL/SL settings into matching groups.</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-violet-400 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}

                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-indigo-900">Bulk Group Migration</p>
                    <p className="text-[10px] text-indigo-600">Move all {groupStudents.length} students to another group.</p>
                  </div>
                  <select
                    onChange={(e) => {
                      const targetGroupId = e.target.value;
                      if (targetGroupId) {
                        moveAllStudentsToGroup(selectedGroupDetails.name, targetGroupId);
                      }
                    }}
                    className="text-[10px] bg-white border border-indigo-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-600"
                    value=""
                  >
                    <option value="">Move Everyone to...</option>
                    {availableGroups.sort((a, b) => b.academicYear.localeCompare(a.academicYear)).map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.academicYear})</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-slate-100 bg-white flex flex-col gap-4">
            <div className="flex items-start gap-2 bg-rose-50 p-3 rounded-xl border border-rose-100">
              <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5" />
              <p className="text-[10px] text-rose-600 font-medium leading-relaxed uppercase tracking-tight">
                Warning: Deleting this group will clear the "Group Name" field for all students listed above. It will not delete the students or their marks.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSelectedGroupDetails(null)}
                className="flex-1 px-6 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl font-bold text-xs transition-all uppercase tracking-widest"
              >
                Back
              </button>
              <button 
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: 'Delete Class Group',
                    message: `This will remove "${selectedGroupDetails.name}" from the system. ${groupStudents.length} students will have their group name cleared. Continue?`,
                    confirmText: 'Confirm Deletion',
                    type: 'danger',
                    onConfirm: async () => {
                      try {
                        setSaveStatus('saving');
                        // 1. Delete Group Doc
                        if (useCloudSync) {
                          await fbDeleteGroup(selectedGroupDetails.id);
                        }
                        
                        // 2. Clear Student groupName fields
                        if (useCloudSync) {
                          const updatePromises = groupStudents.map(s => 
                            fbUpdateStudent(s.id, { groupName: '' })
                          );
                          await Promise.all(updatePromises);
                        }
                        
                        // 3. Sync states
                        setGroups(prev => prev.filter(g => g.id !== selectedGroupDetails.id));
                        setStudents(prev => prev.map(s => {
                          if (groupStudents.some(gs => gs.id === s.id)) {
                            return { ...s, groupName: '' };
                          }
                          return s;
                        }));
                        
                        setSaveStatus('saved');
                        setTimeout(() => setSaveStatus('idle'), 3000);
                        setSelectedGroupDetails(null);
                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                      } catch (err) {
                        console.error(err);
                        setSaveStatus('idle');
                      }
                    }
                  });
                }}
                className="flex-[2] px-6 py-2.5 bg-rose-600 text-white hover:bg-rose-700 rounded-xl font-bold text-xs transition-all shadow-md shadow-rose-200 flex items-center justify-center gap-2 uppercase tracking-widest"
              >
                <Trash2 className="w-4 h-4" />
                Delete Permanently
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  const performanceInsights = useMemo(() => {
    if (performanceTabStats.length === 0) return null;

    const dataKey = performanceDisplayMode === 'percentage' ? 'averagePercentage' : 'averagePoints';
    const labelSuffix = performanceDisplayMode === 'percentage' ? '%' : ' pts';

    // performanceTabStats already filters to students with count > 0, so all have real data
    const avg = performanceTabStats.reduce((acc, p) => acc + (p as any)[dataKey], 0) / performanceTabStats.length;
    
    // Find most improved student from filtered set
    const studentTrends = performances
      .filter(p => performanceTabStats.some(ps => ps.student.id === p.student.id))
      .map(p => {
        // Use only marks where student actually sat the exam (not absent)
        const sitting = ((p as any).sittingMarks || p.marks.filter((m: any) => !m.absent));
        if (sitting.length < 2) return { id: p.student.id, improvement: 0 };
        
        const getMarkPerc = (m: any) => {
          const a = m.assessment;
          if (!a) return 0;
          const p = (m.score / a.maxMarks) * 100;
          if (m.resitScore !== undefined && m.resitScore !== null) {
            const rp = (m.resitScore / (m.resitMaxMarks || a.maxMarks)) * 100;
            return (p + rp) / 2;
          }
          return p;
        };

        const lastPerc = getMarkPerc(sitting[sitting.length - 1]);
        const firstPerc = getMarkPerc(sitting[0]);

        const last = performanceDisplayMode === 'percentage' 
          ? lastPerc
          : gradeToPoints(getGrade(lastPerc, getStudentBoundaries(p.student)));
        
        const first = performanceDisplayMode === 'percentage'
          ? firstPerc
          : gradeToPoints(getGrade(firstPerc, getStudentBoundaries(p.student)));

        return { id: p.student.id, name: p.student.name, improvement: last - first };
      })
      .sort((a, b) => b.improvement - a.improvement);

    const mostImproved = studentTrends[0]?.improvement > 0 ? studentTrends[0] : null;

    // Group calculations
    const displayKey = performanceDisplayMode === 'percentage' ? 'averagePercentage' : 'averagePoints';
    const groupMap: Record<string, { total: number, count: number }> = {};
    const ibLevelMap: Record<string, { total: number, count: number }> = {};

    performanceTabStats.forEach(p => {
      // Group Name
      const gKey = p.student.groupName || 'General';
      if (!groupMap[gKey]) groupMap[gKey] = { total: 0, count: 0 };
      groupMap[gKey].total += (p as any)[displayKey];
      groupMap[gKey].count += 1;

      // IB Levels (for Year 12/13)
      if (String(p.student.yearGroup).includes('IB') && p.student.ibLevel) {
        const ibKey = `IB ${p.student.ibLevel}`;
        if (!ibLevelMap[ibKey]) ibLevelMap[ibKey] = { total: 0, count: 0 };
        ibLevelMap[ibKey].total += (p as any)[displayKey];
        ibLevelMap[ibKey].count += 1;
      }
    });

    const allGroupAverages = [
      ...Object.entries(groupMap).map(([name, data]) => ({ name, avg: data.total / data.count })),
      ...Object.entries(ibLevelMap).map(([name, data]) => ({ name, avg: data.total / data.count }))
    ].sort((a, b) => b.avg - a.avg);

    return {
      average: avg,
      mostImproved,
      allGroupAverages,
      labelSuffix
    };
  }, [performanceTabStats, performances, performanceDisplayMode]);

  const individualStudentTrendData = useMemo(() => {
    if (selectedStudentForPerformance === 'none') return [];
    
    const currentYearAssessments = assessments.filter(a => a.academicYear === selectedAcademicYear);
    const student = students.find(s => s.id === selectedStudentForPerformance);
    
    return marks
      .filter(m => m.studentId === selectedStudentForPerformance)
      .map(m => ({
        ...m,
        assessment: currentYearAssessments.find(a => a.id === m.assessmentId)!
      }))
      .filter(m => m.assessment && (performanceSubjectFilter === 'all' || m.assessment.subject === performanceSubjectFilter))
      .filter(m => matchesYearFilter(m.assessment.yearGroup, yearFilter))
      .sort((a, b) => new Date(a.assessment.date).getTime() - new Date(b.assessment.date).getTime())
      .map(m => {
        const effPerc = (m.score / m.assessment.maxMarks) * 100;
        const resitPerc = (m.resitScore !== undefined && m.resitScore !== null) 
          ? (m.resitScore / (m.resitMaxMarks || m.assessment.maxMarks)) * 100 
          : null;
        const finalPerc = resitPerc !== null ? (effPerc + resitPerc) / 2 : effPerc;

        const boundaries = student ? getStudentBoundaries(student) : [];
        const score = performanceDisplayMode === 'percentage' 
          ? finalPerc
          : gradeToPoints(getGrade(finalPerc, boundaries));

        return {
          date: new Date(m.assessment.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          score,
          assessmentName: m.assessment.name,
          subject: m.assessment.subject,
          grade: getGrade(finalPerc, boundaries)
        };
      });
  }, [selectedStudentForPerformance, marks, assessments, performanceSubjectFilter, yearFilter, performanceDisplayMode, students, yearBoundaries]);

  const subjectTrendData = useMemo(() => {
    const relevantAssessments = assessments
      .filter(a => a.academicYear === selectedAcademicYear && matchesYearFilter(a.yearGroup, yearFilter))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return relevantAssessments.map(assessment => {
      // Only include marks where student actually sat the exam (not absent)
      const assessmentMarks = marks.filter(m => m.assessmentId === assessment.id && !(m as any).absent);
      let avg = 0;
      if (assessmentMarks.length > 0) {
        const getMarkPerc = (m: Mark) => {
          const p = (m.score / assessment.maxMarks) * 100;
          if (m.resitScore !== undefined && m.resitScore !== null) {
            const rp = (m.resitScore / (m.resitMaxMarks || assessment.maxMarks)) * 100;
            return (p + rp) / 2;
          }
          return p;
        };

        if (performanceDisplayMode === 'percentage') {
          avg = assessmentMarks.reduce((acc, m) => acc + getMarkPerc(m), 0) / assessmentMarks.length;
        } else {
          // Calculate points average
          const points = assessmentMarks.map(m => {
            const student = students.find(s => s.id === m.studentId);
            const finalPerc = getMarkPerc(m);
            const boundaries = student ? getStudentBoundaries(student) : [];
            return gradeToPoints(getGrade(finalPerc, boundaries));
          });
          avg = points.reduce((a, b) => a + b, 0) / points.length;
        }
      }

      return {
        date: assessment.date,
        name: assessment.name,
        average: parseFloat(avg.toFixed(2)),
        subject: assessment.subject
      };
    });
  }, [assessments, marks, yearFilter, performanceDisplayMode, students, yearBoundaries]);

  const groupPerformanceData = useMemo(() => {
    const relevantPerformances = performances.filter(p => 
      matchesYearFilter(p.student.yearGroup, yearFilter) && (p as any).hasData
    );
    const dataKey = performanceDisplayMode === 'percentage' ? 'averagePercentage' : 'averagePoints';
    const groupMap: Record<string, { total: number, count: number }> = {};
    
    relevantPerformances.forEach(p => {
      const key = p.student.groupName || 'General';
      if (!groupMap[key]) groupMap[key] = { total: 0, count: 0 };
      groupMap[key].total += (p as any)[dataKey];
      groupMap[key].count += 1;
    });

    return Object.entries(groupMap)
      .map(([group, data]) => ({
        group,
        average: data.total / data.count
      }))
      .sort((a, b) => b.average - a.average);
  }, [performances, yearFilter, performanceDisplayMode]);

  const subjectPerformanceData = useMemo(() => {
    const currentYearAssessments = assessments.filter(a => a.academicYear === selectedAcademicYear);
    const subjects = Array.from(new Set(currentYearAssessments.map(a => a.subject)));
    return subjects.map(subject => {
      const subjectMarks = marks.filter(m => {
        const a = currentYearAssessments.find(as => as.id === m.assessmentId);
        return a?.subject === subject && !(m as any).absent;
      });
      let avg = 0;
      if (subjectMarks.length > 0) {
        const getMarkPerc = (m: Mark) => {
          const a = currentYearAssessments.find(as => as.id === m.assessmentId)!;
          const p = (m.score / a.maxMarks) * 100;
          if (m.resitScore !== undefined && m.resitScore !== null) {
            const rp = (m.resitScore / (m.resitMaxMarks || a.maxMarks)) * 100;
            return (p + rp) / 2;
          }
          return p;
        };

        if (performanceDisplayMode === 'percentage') {
          avg = subjectMarks.reduce((acc, m) => {
            return acc + getMarkPerc(m);
          }, 0) / subjectMarks.length;
        } else {
          const points = subjectMarks.map(m => {
            const student = students.find(s => s.id === m.studentId);
            const finalPerc = getMarkPerc(m);
            const boundaries = student ? getStudentBoundaries(student) : [];
            return gradeToPoints(getGrade(finalPerc, boundaries));
          });
          avg = points.reduce((a, b) => a + b, 0) / points.length;
        }
      }
      return {
        subject,
        average: parseFloat(avg.toFixed(2)),
        count: subjectMarks.length
      };
    });
  }, [assessments, marks, selectedAcademicYear, performanceDisplayMode, students, yearBoundaries]);

  const classPerformanceData = useMemo(() => {
    const yearGroups: YearGroup[] = [7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'];
    const dataKey = performanceDisplayMode === 'percentage' ? 'averagePercentage' : 'averagePoints';
    return yearGroups
      .filter(y => matchesYearFilter(y, yearFilter))
      .map(year => {
      const yearPerformances = performances.filter(p => 
        p.student.yearGroup === year && (p as any).hasData
      );
      const avg = yearPerformances.length > 0 
        ? yearPerformances.reduce((acc, p) => acc + (p as any)[dataKey], 0) / yearPerformances.length 
        : 0;
      return {
        year: typeof year === 'number' ? `Year ${year}` : year,
        average: parseFloat(avg.toFixed(2)),
        count: yearPerformances.length
      };
    }).filter(d => d.count > 0);
  }, [performances, performanceDisplayMode, yearFilter]);

  const backupData = () => {
    const data = {
      academicYear: selectedAcademicYear,
      students: students.filter(s => s.academicYear === selectedAcademicYear),
      assessments: assessments.filter(a => a.academicYear === selectedAcademicYear),
      marks: marks.filter(m => {
        const assessment = assessments.find(a => a.id === m.assessmentId);
        return assessment && assessment.academicYear === selectedAcademicYear;
      }),
      groups: groups.filter(g => g.academicYear === selectedAcademicYear),
      yearBoundaries
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `science_tracker_backup_${selectedAcademicYear}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const restoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target?.result as string);
          if (data.students && data.assessments && data.marks) {
            const backupYear = data.academicYear || CURRENT_ACADEMIC_YEAR;
            const currentYearAssessmentIds = new Set(assessments.filter(a => a.academicYear === backupYear).map(a => a.id));
            
            // Filter out existing data for the backup year to avoid duplicates
            setStudents(prev => [
              ...prev.filter(s => s.academicYear !== backupYear),
              ...data.students
            ]);
            setAssessments(prev => [
              ...prev.filter(a => a.academicYear !== backupYear),
              ...data.assessments
            ]);
            setMarks(prev => [
              ...prev.filter(m => !currentYearAssessmentIds.has(m.assessmentId)),
              ...data.marks
            ]);
            
            if (data.groups) {
              setGroups(prev => [
                ...prev.filter(g => g.academicYear !== backupYear),
                ...data.groups
              ]);
            }
            
            if (data.yearBoundaries) setYearBoundaries(data.yearBoundaries);
            
            setSelectedAcademicYear(backupYear);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
          }
        } catch (err) {
          console.error("Restore error:", err);
          setConfirmModal({
            isOpen: true,
            title: 'Import Error',
            message: 'Invalid backup file. Please ensure you are uploading a valid JSON backup.',
            onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
            confirmText: 'OK',
            type: 'danger'
          });
        }
      };
      reader.readAsText(file);
    }
  };

  const handleYearTransition = async () => {
    const nextYear = getNextAcademicYear(selectedAcademicYear);
    if (!nextYear) {
      setConfirmModal({
        isOpen: true,
        title: 'Cannot Transition',
        message: 'Cannot transition beyond the last supported academic year.',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        confirmText: 'OK',
        type: 'warning'
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Promote Year Groups',
      message: `This will promote all students from ${selectedAcademicYear} to ${nextYear}. Students in Year 13 will be marked as Graduated. Ensure all results are final before proceeding.`,
      confirmText: 'Promote All',
      type: 'warning',
      onConfirm: async () => {
        try {
          setSaveStatus('saving');
          const currentStudents = students.filter(s => s.academicYear === selectedAcademicYear);
          const currentGroups = groups.filter(g => g.academicYear === selectedAcademicYear);
          const currentAssessments = assessments.filter(a => a.academicYear === selectedAcademicYear);

          if (currentStudents.length === 0 && currentGroups.length === 0 && currentAssessments.length === 0) {
            setConfirmModal({
              isOpen: true,
              title: 'Nothing to Promote',
              message: `No data found for ${selectedAcademicYear}.`,
              onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
              confirmText: 'OK'
            });
            setSaveStatus('idle');
            return;
          }

          const newStudentsList: Student[] = [...students];
          const newGroupsList: Group[] = [...groups];
          const newAssessmentsList: Assessment[] = [...assessments];
          
          const addedGroups: Group[] = [];
          const addedStudents: Student[] = [];
          const addedAssessments: Assessment[] = [];

          // Promote Groups
          currentGroups.forEach(group => {
            const nextYearGroup = getNextYearGroup(group.yearGroup);
            if (nextYearGroup) {
              const exists = groups.find(g => g.name === group.name && g.yearGroup === nextYearGroup && g.academicYear === nextYear);
              if (!exists) {
                const groupName = group.name;
                const newId = `group_${groupName}_${nextYearGroup}_${nextYear}`.replace(/\s+/g, '_').toLowerCase();
                const newGroup = {
                  id: newId,
                  name: groupName,
                  yearGroup: nextYearGroup,
                  academicYear: nextYear
                };
                newGroupsList.push(newGroup);
                addedGroups.push(newGroup);
              }
            }
          });

          // Promote Students
          currentStudents.forEach(student => {
            const nextYearGroup = getNextYearGroup(student.yearGroup);
            if (nextYearGroup) {
              const exists = students.find(s => s.name === student.name && s.yearGroup === nextYearGroup && s.academicYear === nextYear);
              if (!exists) {
                const newId = `student_${student.name}_${nextYearGroup}_${nextYear}`.replace(/\s+/g, '_').toLowerCase();
                const newStudentItem = {
                  ...student,
                  id: newId,
                  yearGroup: nextYearGroup,
                  groupName: nextYearGroup === 'Graduated' ? `Class of ${selectedAcademicYear.split('-')[0]}` : student.groupName,
                  academicYear: nextYear
                };
                newStudentsList.push(newStudentItem);
                addedStudents.push(newStudentItem);
              }
            }
          });

          // Promote Assessments (Clone templates to the next year for the same year groups)
          currentAssessments.forEach(assessment => {
            const exists = assessments.find(a => 
              a.name === assessment.name && 
              a.yearGroup === assessment.yearGroup && 
              a.academicYear === nextYear &&
              a.subject === assessment.subject
            );
            if (!exists) {
              // Increment date by 1 year
              let nextDate = assessment.date;
              try {
                const d = new Date(assessment.date);
                d.setFullYear(d.getFullYear() + 1);
                nextDate = d.toISOString().split('T')[0];
              } catch (e) {}

              const newId = `assessment_${assessment.name}_${assessment.subject}_${assessment.yearGroup}_${nextYear}`.replace(/\s+/g, '_').toLowerCase();
              const newAssessmentItem = {
                ...assessment,
                id: newId,
                academicYear: nextYear,
                date: nextDate
              };
              newAssessmentsList.push(newAssessmentItem);
              addedAssessments.push(newAssessmentItem);
            }
          });

          setStudents(newStudentsList);
          setGroups(newGroupsList);
          setAssessments(newAssessmentsList);

          if (useCloudSync) {
            await Promise.all([
              ...addedGroups.map(g => fbAddGroup(g)),
              ...addedStudents.map(s => fbAddStudent(s)),
              ...addedAssessments.map(a => fbAddAssessment(a))
            ]);
          }
          
          // Update filters to follow the cohort
          const nextYG = getNextYearGroup(yearFilter as YearGroup);
          if (nextYG) setYearFilter(nextYG);
          
          setSelectedAcademicYear(nextYear);
          setSaveStatus('saved');
          
          setConfirmModal({
            isOpen: true,
            title: 'Transition Complete',
            message: `Successfully promoted ${currentStudents.length} students, ${currentGroups.length} groups, and ${currentAssessments.length} assessment templates to ${nextYear}.`,
            onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
            confirmText: 'Great!'
          });

          setTimeout(() => setSaveStatus('idle'), 3000);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
           console.error(err);
           setSaveStatus('idle');
           setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handlePaperUpload = async (e: React.ChangeEvent<HTMLInputElement>, assessmentId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setExtractionError(null);

    try {
      // Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/gemini/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base64Data,
          mimeType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
          extractionMode
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Server error occurred" }));
        throw new Error(errorData.error || "Failed to extract questions from server backend.");
      }

      const extractedQuestions: Question[] = await response.json();
      
      if (extractedQuestions.length === 0) {
        throw new Error("No questions could be extracted from the paper. Please ensure the file is clear and contains question numbers and marks.");
      }

      const totalMaxMarks = extractedQuestions.reduce((sum, q) => sum + q.maxMarks, 0);

      // Update assessment in Firestore if Cloud Sync is enabled
      if (useCloudSync) {
        await fbUpdateAssessment(assessmentId, {
          questions: extractedQuestions,
          maxMarks: totalMaxMarks
        });
      }

      // Update local state
      setAssessments(prev => prev.map(a => 
        a.id === assessmentId ? { ...a, questions: extractedQuestions, maxMarks: totalMaxMarks } : a
      ));

      setIsExtracting(false);
    } catch (error: any) {
      console.error("Extraction error:", error);
      setExtractionError(error.message || "Failed to extract questions. Please try again with a clearer file.");
      setIsExtracting(false);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Student',
      message: 'Are you sure you want to delete this student and all their marks? This action cannot be undone.',
      confirmText: 'Delete Student',
      type: 'danger',
      onConfirm: async () => {
        try {
          setSaveStatus('saving');
          const studentMarks = marks.filter(m => m.studentId === studentId);
          if (useCloudSync) {
            await Promise.all([
              fbDeleteStudent(studentId),
              ...studentMarks.map(m => fbDeleteMark(m.id))
            ]);
          }
          
          setStudents(prev => prev.filter(s => s.id !== studentId));
          setMarks(prev => prev.filter(m => m.studentId !== studentId));
          if (selectedStudentId === studentId) {
            setSelectedStudentId(null);
          }
          if (editingStudentId === studentId) {
            setEditingStudentId(null);
            setShowStudentModal(false);
          }
          
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 3000);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error("Failed to delete student:", error);
          setSaveStatus('idle');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleDeleteClass = async (year: YearGroup, groupName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Class',
      message: `Are you sure you want to delete all students and data in ${groupName} (Year ${year})? This action cannot be undone.`,
      confirmText: 'Delete Everything',
      type: 'danger',
      onConfirm: async () => {
        try {
          setSaveStatus('saving');
          const studentsToDelete = students.filter(s => 
            String(s.yearGroup) === String(year) && 
            s.groupName === groupName && 
            s.academicYear === selectedAcademicYear
          );
          const studentIds = new Set(studentsToDelete.map(s => s.id));
          const marksToDelete = marks.filter(m => studentIds.has(m.studentId));
          const groupToDelete = groups.find(g => g.name === groupName && g.yearGroup === year && g.academicYear === selectedAcademicYear);
          
          if (useCloudSync) {
            const deletePromises = [
              ...studentsToDelete.map(s => fbDeleteStudent(s.id)),
              ...marksToDelete.map(m => fbDeleteMark(m.id))
            ];
            
            if (groupToDelete) {
              deletePromises.push(fbDeleteGroup(groupToDelete.id));
            }
            
            await Promise.all(deletePromises);
          }
          
          setStudents(prev => prev.filter(s => !studentIds.has(s.id)));
          setMarks(prev => prev.filter(m => !studentIds.has(m.studentId)));
          if (groupToDelete) {
            setGroups(prev => prev.filter(g => g.id !== groupToDelete.id));
          }
          if (selectedStudentId && studentIds.has(selectedStudentId)) {
            setSelectedStudentId(null);
          }
          
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 3000);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error("Failed to delete class:", error);
          setSaveStatus('idle');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const consolidateStudents = async () => {
    if (!confirm("This will merge students with identical names in the same Year Group. Marks will be consolidated into a single record. This cannot be undone. Proceed?")) return;

    setSaveStatus('saving');
    const duplicatesGrouped: { [key: string]: Student[] } = {};
    
    students.forEach(s => {
      const normalize = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const key = `${normalize(s.name)}|${s.yearGroup}|${s.academicYear}`;
      if (!duplicatesGrouped[key]) duplicatesGrouped[key] = [];
      duplicatesGrouped[key].push(s);
    });

    const tasks = Object.values(duplicatesGrouped).filter(group => group.length > 1);
    
    if (tasks.length === 0) {
      alert("No obvious duplicates found.");
      setSaveStatus('idle');
      return;
    }

    try {
      for (const group of tasks) {
        // First student is the master
        const master = group[0];
        const others = group.slice(1);

        for (const duplicate of others) {
          // 1. Collect marks for this duplicate
          const duplicateMarks = marks.filter(m => m.studentId === duplicate.id);
          
          for (const mark of duplicateMarks) {
            const hasExisting = marks.some(m => m.studentId === master.id && m.assessmentId === mark.assessmentId);
            if (!hasExisting) {
              // Move mark to master
              const newMarkId = getMarkId(master.id, mark.assessmentId);
              await fbSetMark({ ...mark, id: newMarkId, studentId: master.id });
            }
            // Delete duplicate's mark
            await fbDeleteMark(mark.id);
          }

          // 2. Merge baseline if master is missing it
          if (!master.baselineGrade && duplicate.baselineGrade) {
            master.baselineGrade = duplicate.baselineGrade;
            await fbUpdateStudent(master.id, { baselineGrade: duplicate.baselineGrade });
          }

          // 3. Delete duplicate
          await fbDeleteStudent(duplicate.id);
        }
      }
      
      // Update local state to reflect changes
      const allDuplicatesIds = tasks.flatMap(group => group.slice(1).map(s => s.id));
      setStudents(prev => prev.filter(s => !allDuplicatesIds.includes(s.id)));
      
      // Update marks too
      setMarks(prev => prev.map(m => {
        const foundGroup = tasks.find(group => group.some(s => s.id === m.studentId));
        if (foundGroup) {
          const master = foundGroup[0];
          return { ...m, studentId: master.id, id: getMarkId(master.id, m.assessmentId) };
        }
        return m;
      }));

      alert(`Successfully merged ${tasks.length} student groups.`);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error("Consolidation error:", error);
      alert("An error occurred. Check console for details.");
      setSaveStatus('idle');
    }
  };

  const handleDeleteAssessment = async (assessmentId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Assessment',
      message: 'Are you sure you want to delete this assessment and all associated marks? This cannot be undone.',
      confirmText: 'Delete Assessment',
      type: 'danger',
      onConfirm: async () => {
        try {
          setSaveStatus('saving');
          const assessmentMarks = marks.filter(m => m.assessmentId === assessmentId);
          if (useCloudSync) {
            await Promise.all([
              fbDeleteAssessment(assessmentId),
              ...assessmentMarks.map(m => fbDeleteMark(m.id))
            ]);
          }
          
          setAssessments(prev => prev.filter(a => a.id !== assessmentId));
          setMarks(prev => prev.filter(m => m.assessmentId !== assessmentId));
          
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 3000);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error("Failed to delete assessment:", error);
          setSaveStatus('idle');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const moveStudentToGroup = async (studentId: string, targetGroupId: string) => {
    const targetGroup = groups.find(g => g.id === targetGroupId);
    if (!targetGroup) return;

    if (!confirm(`Move student to ${targetGroup.name} (${targetGroup.academicYear})?`)) return;
    try {
      setSaveStatus('saving');
      
      const updateData: any = { 
        groupName: targetGroup.name,
        academicYear: targetGroup.academicYear,
        yearGroup: targetGroup.yearGroup 
      };
      
      console.log(`Moving student ${studentId} to group ${targetGroup.name}`, updateData);
      
      await fbUpdateStudent(studentId, updateData);
      
      // Update local state
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...updateData } : s));
      
      setSaveStatus('saved');
      alert(`Moved successfully to ${targetGroup.name}`);
      setTimeout(() => setSaveStatus('idle'), 3000);
      
      // Check for duplicates after move
      const targetStudent = students.find(s => s.id === studentId);
      if (targetStudent) {
        const potentialDuplicates = students.filter(s => 
          s.id !== studentId && 
          s.name.toLowerCase().trim() === targetStudent.name.toLowerCase().trim() &&
          s.groupName === targetGroup.name &&
          s.academicYear === targetGroup.academicYear
        );
        if (potentialDuplicates.length > 0) {
          if (confirm(`A student named "${targetStudent.name}" already exists in ${targetGroup.name}. Consolidate their records now? This will merge marks if possible.`)) {
            consolidateStudents();
          }
        }
      }
    } catch (error) {
      console.error("Move error:", error);
      setSaveStatus('idle');
      alert(`Error moving student: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const moveAllStudentsToGroup = async (sourceGroupName: string, targetGroupId: string) => {
    const targetGroup = groups.find(g => g.id === targetGroupId);
    if (!targetGroup) return;

    if (!confirm(`Move ALL students from ${sourceGroupName} to ${targetGroup.name} (${targetGroup.academicYear})?`)) return;
    try {
      setSaveStatus('saving');
      const targetYear = selectedGroupDetails?.academicYear || selectedAcademicYear;
      
      const studentsToMove = students.filter(s => 
        s.groupName === sourceGroupName && 
        s.academicYear === targetYear
      );
      
      if (studentsToMove.length === 0) {
        alert("No students found to move.");
        setSaveStatus('idle');
        return;
      }

      const updateData: any = { 
        groupName: targetGroup.name,
        academicYear: targetGroup.academicYear,
        yearGroup: targetGroup.yearGroup 
      };

      const updatePromises = studentsToMove.map(s => fbUpdateStudent(s.id, updateData));
      await Promise.all(updatePromises);
      
      setStudents(prev => prev.map(s => 
        (s.groupName === sourceGroupName && s.academicYear === targetYear)
          ? { ...s, ...updateData }
          : s
      ));
      
      setSaveStatus('saved');
      alert(`Successfully moved ${studentsToMove.length} students to ${targetGroup.name}.`);
      setTimeout(() => setSaveStatus('idle'), 3000);

      const sourceGroup = groups.find(g => g.name === sourceGroupName && g.academicYear === targetYear);
      if (sourceGroup && confirm(`Move completed. The group "${sourceGroupName}" is now empty. Delete it?`)) {
        await fbDeleteGroup(sourceGroup.id);
        setGroups(prev => prev.filter(g => g.id !== sourceGroup.id));
      }
      
      if (confirm("Move complete. Would you like to scan for and merge any duplicate names in the target group?")) {
        consolidateStudents();
      }
      
      setSelectedGroupDetails(null); 
    } catch (error) {
      console.error(error);
      setSaveStatus('idle');
      alert(`Error moving students: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Group',
      message: 'Are you sure you want to delete this group? Students will remain but will be unassigned from this group.',
      confirmText: 'Delete Group',
      type: 'danger',
      onConfirm: async () => {
        try {
          setSaveStatus('saving');
          const group = groups.find(g => g.id === groupId);
          if (group) {
            if (useCloudSync) {
              await fbDeleteGroup(groupId);
            }
            setGroups(prev => prev.filter(g => g.id !== groupId));
            
            // Clear groupName for students in this group
            const studentsToUpdate = students.filter(s => s.groupName === group.name && String(s.yearGroup) === String(group.yearGroup) && s.academicYear === group.academicYear);
            if (useCloudSync) {
              await Promise.all(studentsToUpdate.map(s => fbUpdateStudent(s.id, { groupName: '' })));
            }
            setStudents(prev => prev.map(s => studentsToUpdate.find(stu => stu.id === s.id) ? { ...s, groupName: '' } : s));
          }
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 3000);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error("Failed to delete group:", error);
          setSaveStatus('idle');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleBulkStudentImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    const processData = (data: any[][], sheetName?: string) => {
      // Find header row index (row containing 'Surname', 'Last Name', 'Forename', or 'First Name')
      const headerIndex = data.findIndex(row => 
        row.some(cell => {
          if (typeof cell !== 'string') return false;
          const c = cell.toLowerCase();
          return c.includes('surname') || c.includes('last name') || c.includes('forename') || c.includes('first name');
        })
      );
      
      if (headerIndex === -1) {
        return []; // No valid data in this sheet
      }

      const headers = data[headerIndex];
      const dataRows = data.slice(headerIndex + 1);
      
      // Try to guess group name from sheet name or first row
      let guessedGroup = sheetName || '';
      if (!guessedGroup && data[0] && typeof data[0][0] === 'string') {
        const firstCell = data[0][0];
        const match = firstCell.match(/^([^\s-]+)/);
        if (match) guessedGroup = match[0];
      }

      // Map column indices
      const surnameIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('surname') || c.includes('last name');
      });
      const forenameIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('forename') || c.includes('first name');
      });
      const yearIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('year');
      });
      const groupIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('group') || c.includes('class');
      });
      const baselineIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('baseline');
      });
      const subjectsIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('subject');
      });
      const levelsIdx = headers.findIndex(h => {
        if (typeof h !== 'string') return false;
        const c = h.toLowerCase();
        return c.includes('level');
      });
      
      const normalizeYearGroup = (val: any): YearGroup => {
        if (!val) return 7;
        const s = String(val).trim();
        const num = parseInt(s);
        // Check explicit IGCSE/IB strings first
        if (s.toLowerCase().includes('igcse') || num === 10 || num === 11) {
          if (num === 11 || s.includes('11')) return '11 IGCSE';
          return '10 IGCSE';
        }
        if (s.toLowerCase().includes('ib') || num === 12 || num === 13) {
          if (num === 13 || s.includes('13')) return '13 IB';
          return '12 IB';
        }
        if (num === 7 || s === '7') return 7;
        if (num === 8 || s === '8') return 8;
        if (num === 9 || s === '9') return 9;
        // For plain numeric strings like "10 IGCSE", "11 IGCSE" — extract leading number
        const match = s.match(/^(\d+)/);
        if (match) {
          const n = parseInt(match[1]);
          if (n === 7) return 7;
          if (n === 8) return 8;
          if (n === 9) return 9;
          if (n === 10) return '10 IGCSE';
          if (n === 11) return '11 IGCSE';
          if (n === 12) return '12 IB';
          if (n === 13) return '13 IB';
        }
        return 7;
      };

      return dataRows.map(row => {
        const yearGroup = normalizeYearGroup(row[yearIdx]);
        // Parse subjects: if column exists use it, else auto-assign all subjects for the year
        let subjects: string[] = SUBJECTS_BY_YEAR[yearGroup] || [];
        if (subjectsIdx !== -1 && row[subjectsIdx]) {
          // Support comma-separated subjects e.g. "Physics, Chemistry" or "Biology"
          const rawSubjects = String(row[subjectsIdx]).split(',').map((s: string) => s.trim()).filter(Boolean);
          // Normalise to match exact subject names (case-insensitive)
          const allSubjectsForYear = SUBJECTS_BY_YEAR[yearGroup] || [];
          subjects = rawSubjects.map((rs: string) => {
            const match = allSubjectsForYear.find(s => s.toLowerCase() === rs.toLowerCase());
            return match || rs; // use matched name or keep as-is
          });
        }
        // Parse HL/SL levels — comma-separated in same order as subjects
        let subjectLevels: Record<string, string> = {};
        if (levelsIdx !== -1 && row[levelsIdx] && subjects.length > 0) {
          const rawLevels = String(row[levelsIdx]).split(',').map((l: string) => l.trim().toUpperCase());
          subjects.forEach((subj: string, i: number) => {
            const level = rawLevels[i];
            if (level === 'HL' || level === 'SL') subjectLevels[subj] = level;
          });
        }
        return {
          id: Math.random().toString(36).substr(2, 9),
          name: `${row[forenameIdx] || ''} ${row[surnameIdx] || ''}`.trim(),
          yearGroup,
          groupName: (groupIdx !== -1 ? String(row[groupIdx] || '') : guessedGroup) || '',
          baselineGrade: baselineIdx !== -1 ? String(row[baselineIdx] || '').trim() : '',
          academicYear: selectedAcademicYear,
          subjects,
          ...(Object.keys(subjectLevels).length > 0 && { subjectLevels })
        };
      }).filter(s => s.name !== '' && s.name !== ' ');
    };

    const finalizeImport = (newStudents: any[]) => {
      const existingStudentKeys = new Set(students.map(s => `${s.name.toLowerCase()}|${s.groupName.toLowerCase()}`));
      
      const toAdd: Student[] = [];
      let duplicateCount = 0;
      const seenInImport = new Set<string>();

      newStudents.forEach(s => {
        const key = `${s.name.toLowerCase()}|${s.groupName.toLowerCase()}`;
        if (existingStudentKeys.has(key) || seenInImport.has(key)) {
          duplicateCount++;
        } else {
          const studentId = s.id || `student_${s.name}_${s.groupName}_${selectedAcademicYear}`.replace(/\s+/g, '_').toLowerCase();
          const studentWithId = { ...s, id: studentId };
          toAdd.push(studentWithId);
          seenInImport.add(key);
        }
      });

      if (toAdd.length > 0) {
        setStudents(prev => [...prev, ...toAdd]);
        if (useCloudSync) {
          toAdd.forEach(s => fbAddStudent(s));
        }
        
        // Auto-create group entries for any new groups discovered
        const newGroupEntries: Group[] = [];
        const groupKeys = new Set(groups.map(g => `${String(g.yearGroup)}|${g.name}|${g.academicYear}`));
        
        toAdd.forEach(s => {
          if (!s.groupName) return;
          const key = `${String(s.yearGroup)}|${s.groupName}|${s.academicYear}`;
          if (!groupKeys.has(key)) {
            const groupId = `group_${s.yearGroup}_${s.groupName}_${s.academicYear}`.replace(/\s+/g, '_');
            const group = {
              id: groupId,
              yearGroup: s.yearGroup,
              name: s.groupName,
              academicYear: s.academicYear
            };
            newGroupEntries.push(group);
            groupKeys.add(key);
            if (useCloudSync) fbAddGroup(group);
          }
        });
        
        if (newGroupEntries.length > 0) {
          setGroups(prev => [...prev, ...newGroupEntries]);
        }
        
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }

      if (duplicateCount > 0) {
        setConfirmModal({
          isOpen: true,
          title: 'Import Completed',
          message: `${duplicateCount} duplicate students were found and skipped (same name and group).`,
          onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
          confirmText: 'OK',
          type: 'warning'
        });
      }
    };

    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        
        const allStudents: Student[] = [];
        wb.SheetNames.forEach(wsname => {
          const ws = wb.Sheets[wsname];
          const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          allStudents.push(...processData(jsonData, wsname));
        });

        finalizeImport(allStudents);
        e.target.value = '';
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const allStudents = processData(results.data as any[][]);
          finalizeImport(allStudents);
          e.target.value = '';
        }
      });
    }
  };

  const updateQuestionScore = (studentId: string, assessmentId: string, questionNumber: string, score: number) => {
    setMarks(prev => {
      const existingMark = prev.find(m => m.studentId === studentId && m.assessmentId === assessmentId);
      
      if (existingMark) {
        const newQuestionScores: Record<string, number> = { 
          ...(existingMark.questionScores || {}), 
          [questionNumber]: score 
        };
        const newTotalScore = Object.values(newQuestionScores).reduce((sum: number, s: number) => sum + s, 0);
        
        return prev.map(m => 
          (m.studentId === studentId && m.assessmentId === assessmentId)
            ? { ...m, questionScores: newQuestionScores, score: newTotalScore }
            : m
        );
      } else {
        const newQuestionScores: Record<string, number> = { [questionNumber]: score };
        return [...prev, { 
          id: Math.random().toString(36).substr(2, 9),
          studentId, 
          assessmentId, 
          questionScores: newQuestionScores, 
          score 
        }];
      }
    });
  };

  const downloadStudentTemplate = () => {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Students ───────────────────────────────────────────────────
    const studentData = [
      ['Surname', 'Forename (Firstname)', 'Preferred Name', 'Year Group (NC)', 'Academic House', 'Year Group Code', 'Baseline Grade'],
      ['Ahmed',   'Sarah',                'Sarah',          '8',               'Ruby',           '8x',               '7'],
      ['Brown',   'James',                'Jim',            '10',              'Jade',           '10A',              'A*'],
      ['Clarke',  'Emma',                 'Emma',           '12',              'Topaz',          '12B',              '6'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(studentData);
    ws1['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Students');

    // ── Sheet 2: Instructions ────────────────────────────────────────────────
    const instructions = [
      ['STUDENT LIST UPLOAD — INSTRUCTIONS'],
      [''],
      ['Fill in one row per student.'],
      [''],
      ['COLUMN GUIDE'],
      ['Surname',             'Student family name'],
      ['Forename (Firstname)', 'Student legal first name'],
      ['Preferred Name',      'Name the student prefers to be called'],
      ['Year Group (NC)',     'Year group (e.g. 7, 8, 9, 10, 11, 12, 13)'],
      ['Academic House',      'Student house affiliation'],
      ['Year Group Code',     'Class code e.g. 8x, 10A, 12B'],
      ['Baseline Grade',      'Optional baseline grade for tracking (e.g. 7, A*)'],
      [''],
      ['TIPS'],
      ['• Delete the example rows before uploading.'],
      ['• Year 10/11 will be treated as IGCSE, Year 12/13 as IB.'],
      ['• Group names are case-sensitive.'],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(instructions);
    ws2['!cols'] = [{ wch: 20 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

    XLSX.writeFile(wb, 'Student_List_Template.xlsx');
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Assessment Marks ─────────────────────
    const headers = ['Surname', 'Forename (Firstname)', 'Preferred Name', 'Year Group (NC)', 'Academic House', 'Year Group Code', 'Subject', 'Assessment Name', 'Score', 'Max Marks', 'Date'];
    const data = [
      headers,
      ['Ahmed',  'Sarah', 'Sarah', '7', 'House A', '7W', 'Computer Science', 'Unit Test 1', 38, 50, '2024-01-15'],
      ['Brown',  'James', 'Jim',   '7', 'House B', '7W', 'Computer Science', 'Unit Test 1', 40, 50, '2024-01-15'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(data);
    ws1['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 15 }, { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Marks');

    // ── Sheet 2: Student Details ──────────────────────
    const studentHeaders = ['Surname', 'Forename (Firstname)', 'Preferred Name', 'Year Group (NC)', 'Academic House', 'Year Group Code'];
    const studentData = [
      studentHeaders,
      ['Ahmed', 'Sarah', 'Sarah', '7', 'House A', '7W'],
      ['Brown', 'James', 'Jim',   '7', 'House B', '7W'],
      ['Charlie', 'Dave', 'Dave', '8', 'House C', '8X'],
      ['Delta', 'Eve', 'Eve', '8', 'House D', '8Y'],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(studentData);
    XLSX.utils.book_append_sheet(wb, ws3, 'Students');

    // ── Sheet 3: Instructions ────────────────────────────────────────────────
    const instructions = [
      ['ASSESSMENT MARKS UPLOAD — INSTRUCTIONS'],
      [''],
      ['HOW TO USE THIS TEMPLATE'],
      ['1.', 'Fill in the "Marks" sheet to upload scores for existing or new students.'],
      ['2.', 'Use the "Students" sheet to bulk-add students without marks.'],
      ['3.', 'Surname, Forename (Firstname), and Year Group (NC) are essential.'],
      ['4.', 'Year Group Code (e.g., 8x, 8y) identifies the specific class group.'],
      [''],
      ['COLUMN GUIDE'],
      ['Surname',              'Student family name'],
      ['Forename (Firstname)',   'Student legal first name'],
      ['Preferred Name',       'Optional. Name the student prefers'],
      ['Year Group (NC)',      'Numbers 7-9, or "10 IGCSE", "11 IGCSE", "12 IB", "13 IB"'],
      ['Academic House',       'Optional housekeeping data'],
      ['Year Group Code',      'Specific class code e.g. 8X, 8Y, 7W'],
      ['Assessment Name',      'Name of the test/exam'],
      ['Score',                'The mark achieved'],
      ['Max Marks',            'Total possible marks'],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(instructions);
    ws2['!cols'] = [{ wch: 22 }, { wch: 75 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

    XLSX.writeFile(wb, 'Assessment_Marks_Template.xlsx');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const allData: any[] = [];
    let fileName = files[0].name.replace(/\.[^/.]+$/, "");
    if (files.length > 1) fileName = "Multiple Files";

    const normalizeKey = (key: string | number) => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    const findValue = (row: any, possibleKeys: string[]) => {
      const rowKeys = Object.keys(row);
      const normalizedPossible = possibleKeys.map(k => normalizeKey(k));
      const foundKey = rowKeys.find(rk => normalizedPossible.includes(normalizeKey(rk)));
      return foundKey ? row[foundKey] : undefined;
    };

    const getJsonDataFromSheet = (ws: any) => {
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      const headerIndex = rows.findIndex(row => 
        row.some(cell => {
          if (!cell) return false;
          const c = String(cell).toLowerCase();
          return c.includes('surname') || c.includes('forename') || c.includes('student');
        })
      );
      
      if (headerIndex === -1) {
        // Fallback to searching for ANY row with data
        const firstDataIndex = rows.findIndex(row => row.some(cell => cell !== null && cell !== ''));
        if (firstDataIndex === -1) return [];
        
        const headers = rows[firstDataIndex].map((h, i) => String(h || `Column_${i}`).trim());
        const dataRows = rows.slice(firstDataIndex + 1);
        return dataRows.filter(row => row.some(cell => cell !== null && cell !== '')).map(row => {
          const obj: any = {};
          headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
          return obj;
        });
      }

      const headers = rows[headerIndex].map((h, i) => String(h || `__EMPTY_${i}`).trim());
      const dataRows = rows.slice(headerIndex + 1);
      return dataRows.filter(row => row.some(cell => cell !== null && cell !== '')).map(row => {
        const obj: any = {};
        headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
        return obj;
      });
    };

    const processData = (data: any[], sheetName?: string) => {
      if (data.length === 0) return;

      const headers: string[] = Array.from(new Set(data.flatMap((row: any) => Object.keys(row))));
      const metadataKeysStripped = [
        'studentname', 'name', 'student', 'fullname', 'pupil', 'pupilname',
        'surname', 'lastname', 'forename', 'firstname', 'forenamefirstname',
        'yeargroup', 'year', 'yeargroupnc', 'groupname', 'group', 'class', 'yeargroupcode',
        'academichouse', 'house', 'subject', 'date', 'maxmarks', 'assessmentname', 'score', 'mark',
        'upn', 'uln', 'gender', 'dob', 'sen', 'pp', 'fsm', 'eal', 'ethnicity', 'notes', 'comments', 'attendance', 'email', 'id', 'mis_id', 'sheetname'
      ];

      const scoreColumns = headers.filter(h => {
        const nh = normalizeKey(h);
        if (metadataKeysStripped.includes(nh)) return false;
        if (nh.startsWith('empty')) return false; // Ignore __EMPTY_n columns
        
        return data.some((row: any) => {
          const val = row[h];
          return val !== undefined && val !== null && val !== '' && !isNaN(parseFloat(val));
        });
      });
      
      const hasAssessmentNameColumn = headers.some(h => normalizeKey(h) === 'assessmentname');
      
      setPendingImport({ data, fileName, sheetName });
      
      let guessedYear: YearGroup = 7;
      const yearMatch = fileName.match(/\b(7|8|9|10|11|12|13)\b/i);
      if (yearMatch) {
        const num = parseInt(yearMatch[0]);
        if (num === 10 || num === 11) guessedYear = `${num} IGCSE` as YearGroup;
        else if (num === 12 || num === 13) guessedYear = `${num} IB` as YearGroup;
        else guessedYear = num as YearGroup;
      }
      if (fileName.toLowerCase().includes('igcse')) {
        if (fileName.includes('10')) guessedYear = '10 IGCSE';
        else if (fileName.includes('11')) guessedYear = '11 IGCSE';
      } else if (fileName.toLowerCase().includes('ib')) {
        if (fileName.includes('12')) guessedYear = '12 IB';
        else if (fileName.includes('13')) guessedYear = '13 IB';
      }
      
      setImportConfig({
        yearGroup: (yearFilter === 'all' || yearFilter === 'IGCSE_ALL' || yearFilter === 'IB_ALL') ? guessedYear : yearFilter,
        groupName: fileName,
        assessmentName: hasAssessmentNameColumn ? 'Multiple (from File)' : (scoreColumns.length > 0 ? 'Multiple Columns' : 'New Assessment'),
        subject: SUBJECTS_BY_YEAR[(yearFilter === 'all' || yearFilter === 'IGCSE_ALL' || yearFilter === 'IB_ALL') ? guessedYear : yearFilter][0],
        maxMarks: 100,
        date: new Date().toISOString().split('T')[0]
      });
      
      setImportPreview(null);
      setImportColumnSubjects({});
      setShowImportModal(true);
      e.target.value = '';
    };

    for (const file of files) {
      const data = await new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onload = (evt) => resolve(evt.target?.result as ArrayBuffer);
        reader.readAsArrayBuffer(file);
      });
      
      const wb = XLSX.read(data, { type: 'array' });
      wb.SheetNames.forEach(wsname => {
        const ws = wb.Sheets[wsname];
        const jsonData = getJsonDataFromSheet(ws);
        if (jsonData.length > 0) {
          jsonData.forEach((row: any) => { row.__sheetName = wsname; });
          allData.push(...jsonData);
        }
      });
    }
    processData(allData, fileName);
  };

  const confirmImport = () => {
    if (!pendingImport) return;

    const { data, sheetName: defaultSheetName } = pendingImport;
    const { yearGroup, groupName, assessmentName: defaultAssessmentName, subject: defaultSubject, maxMarks: defaultMaxMarks, date: defaultDate } = importConfig;

    const newMarks: Mark[] = [...marks];
    const newStudents: Student[] = [...students];
    const newAssessments: Assessment[] = [...assessments];
    const newGroups: Group[] = [...groups];

    // Ensure group exists
    let group = newGroups.find(g => g.name === groupName && g.yearGroup === yearGroup && g.academicYear === selectedAcademicYear);
    if (!group) {
      group = {
        id: Math.random().toString(36).substr(2, 9),
        yearGroup,
        name: groupName,
        academicYear: selectedAcademicYear
      };
      newGroups.push(group);
    }

    const normalizeKey = (key: string | number) => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    const findValue = (row: any, possibleKeys: string[]) => {
      const rowKeys = Object.keys(row);
      const normalizedPossible = possibleKeys.map(k => normalizeKey(k));
      const foundKey = rowKeys.find(rk => normalizedPossible.includes(normalizeKey(rk)));
      return foundKey ? row[foundKey] : undefined;
    };

    // Helper: normalise level value to 'HL' | 'SL' | undefined
    const normalizeLevel = (val: any): 'HL' | 'SL' | undefined => {
      if (!val) return undefined;
      const s = String(val).trim().toUpperCase();
      if (s === 'HL' || s === 'HIGHER' || s === 'HIGHER LEVEL') return 'HL';
      if (s === 'SL' || s === 'STANDARD' || s === 'STANDARD LEVEL') return 'SL';
      return undefined;
    };

    // Normalise a subject string to match SUBJECTS_BY_YEAR keys (case-insensitive)
    const normalizeSubjectName = (raw: string): string => {
      const allSubjects = ['Computer Science'];
      const match = allSubjects.find(s => s.toLowerCase() === raw.trim().toLowerCase());
      return match || raw.trim();
    };

    const extractInfo = (header: string, rowData?: any, sheetName?: string) => {
      let name = header;
      let maxMarks = defaultMaxMarks;
      let subjectFromHeader: string | undefined;

      // 1. Extract max marks from header: "Topic 1 (29)" or "Topic 1(29)"
      const marksMatch = header.match(/\((\d+)\)/);
      if (marksMatch) {
        maxMarks = parseInt(marksMatch[1]);
        name = header.replace(marksMatch[0], '').trim();
      }

      // 2. Extract subject from header if present after a dash:
      //    "Programming - Computer Science" → name=Programming, subject=Computer Science
      //    "Topic 3 Data - Physics"         → name=Topic 3 Data, subject=Physics
      const dashMatch = name.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch) {
        const possibleSubject = dashMatch[2].trim();
        const allSubjects = ['Computer Science'];
        const isKnownSubject = allSubjects.some(s => s.toLowerCase() === possibleSubject.toLowerCase());
        if (isKnownSubject) {
          name = dashMatch[1].trim();
          subjectFromHeader = normalizeSubjectName(possibleSubject);
        }
      }

      // 3. Check for sub-header in the first row of data
      if (rowData && rowData[header]) {
        const subVal = String(rowData[header]);
        const subMarksMatch = subVal.match(/\((\d+)\)/);
        if (subMarksMatch) {
          maxMarks = parseInt(subMarksMatch[1]);
          if (name.startsWith('__EMPTY') || !name || name.toLowerCase() === 'score' || name.toLowerCase() === 'mark') {
            name = subVal.replace(subMarksMatch[0], '').trim() || name;
          }
        }
      }

      // 4. Handle __EMPTY or generic names
      if (name.startsWith('__EMPTY') || !name || name.toLowerCase() === 'score' || name.toLowerCase() === 'mark') {
        name = sheetName || 'Test Topic';
      }

      return { name, maxMarks, subjectFromHeader };
    };

    const headers: string[] = Array.from(new Set(data.flatMap((row: any) => Object.keys(row))));
    const metadataHeaders = [
      'studentname', 'name', 'student', 'fullname', 'pupil', 'pupilname',
      'surname', 'lastname', 'forename', 'firstname', 'forenamefirstname',
      'yeargroup', 'year', 'yeargroupnc', 'groupname', 'group', 'class', 'yeargroupcode',
      'academichouse', 'house',
      'baseline', 'baselinegrade', 'baselinegrade', 'target', 'targetgrade', 'predicted', 
      'ks2', 'ks3', 'cats', 'midyis', 'yellis', 'endofks2', 'ks2', 'ks3', 'cats', 'midyis', 'yellis', 'workingtowards', 'expectation',
      'compsci', 'cs', 'ict', 'computerscience',
      'subject', 'subjects', 'level', 'iblevel', 'date', 'maxmarks', 'assessmentname', 'score', 'mark', 'isnew', 'newstudent', 'latejoined',
      'upn', 'uln', 'gender', 'dob', 'sen', 'pp', 'fsm', 'eal', 'ethnicity', 'notes', 'comments', 'attendance', 'email', 'id', 'mis_id', 'sheetname'
    ].map(k => normalizeKey(k));

    const hasAssessmentNameColumn = headers.some(h => normalizeKey(h) === 'assessmentname');
    const scoreColumns: string[] = headers.filter(h => {
      if (metadataHeaders.includes(normalizeKey(h))) return false;
      return data.some((row: any) => {
        const val = row[h];
        return val !== undefined && val !== null && val !== '' && !isNaN(parseFloat(val));
      });
    });

    // Check if the first row is a sub-header (contains marks in parentheses)
    const firstRow = data[0];
    const isFirstRowSubHeader = firstRow && scoreColumns.some(col => String(firstRow[col]).includes('('));
    const dataToProcess = isFirstRowSubHeader ? data.slice(1) : data;

    dataToProcess.forEach((row: any) => {
      // Support both "Student Name" single column and "Surname" + "First Name" split columns
      let studentNameRaw = findValue(row, ['studentname', 'name', 'student', 'fullname', 'pupil', 'pupilname']);
      if (!studentNameRaw) {
        const surname = findValue(row, ['surname', 'lastname', 'last name', 'familyname']);
        const forename = findValue(row, ['forename', 'firstname', 'first name', 'forename firstname', 'givenname', 'forename']);
        if (surname || forename) {
          studentNameRaw = `${String(forename || '').trim()} ${String(surname || '').trim()}`.trim();
        }
      }
      if (!studentNameRaw) return;
      const studentName = String(studentNameRaw).trim();
      const preferredName = findValue(row, ['preferredname', 'preferred name', 'nickname']) || '';
      const academicHouse = findValue(row, ['academichouse', 'academic house', 'house']) || '';
      const isNewRaw = findValue(row, ['isnew', 'newstudent', 'new', 'latejoined']);
      const isNew = isNewRaw !== undefined ? (String(isNewRaw).toLowerCase() === 'true' || String(isNewRaw).toLowerCase() === 'yes' || isNewRaw === 1 || String(isNewRaw).toLowerCase() === 'y') : false;
      const notesRaw = findValue(row, ['notes', 'comments', 'details', 'studentdetails']);
      const studentNotes = notesRaw ? String(notesRaw).trim() : '';

      const rowSheetName = row.__sheetName || defaultSheetName;

      // Derive the year group: prefer the import config (set by user in the modal),
      // But also accept the per-row Year Group cell as a cross-check.
      // If the row's Year Group cell disagrees with the import config, trust the import config —
      // this protects against data-entry errors like "11 IGCSE", "12 IGCSE" appearing in a 10R sheet.
      const rowYearGroupRaw = findValue(row, ['yeargroup', 'year group', 'year', 'year group (nc)']);
      const rowYearGroup = (() => {
        if (!rowYearGroupRaw) return yearGroup;
        const s = String(rowYearGroupRaw).trim().toLowerCase();
        if (s.includes('10')) return '10 IGCSE' as YearGroup;
        if (s.includes('11')) return '11 IGCSE' as YearGroup;
        if (s.includes('12')) return '12 IB' as YearGroup;
        if (s.includes('13')) return '13 IB' as YearGroup;
        if (s.includes('7')) return 7 as YearGroup;
        if (s.includes('8')) return 8 as YearGroup;
        if (s.includes('9')) return 9 as YearGroup;
        return yearGroup;
      })();
      // If row says a different year from import config, trust import config (handles data entry errors)
      let effectiveYearGroup = String(rowYearGroup) === String(yearGroup) ? yearGroup : yearGroup;

      // Read per-row subject and level (overrides the import config defaults for this row)
      const rowSubjectOverride = findValue(row, ['subject', 'subjects']);
      const rowLevel = normalizeLevel(findValue(row, ['level', 'ib level', 'iblevel']));

      // Determine group name with this priority:
      // 1. The 'Group' or 'Class' column in the row data (most explicit — e.g. '10R', '10S', '7W')
      // 2. The sheet name (set as __sheetName on every row for Excel imports)
      // 3. The importConfig groupName (filename fallback for CSV imports)
      const rowGroupCol = findValue(row, ['group', 'class', 'groupname', 'year group code', 'reg group', 'registration group', 'class code']);
      const rowGroupNameCandidate = rowGroupCol ? String(rowGroupCol).trim() : null;
      // If rowGroupName is just a number matching the year, and we have a descriptive sheet name, prefer the sheet name
      // This handles cases where MIS exports generic year codes but descriptive sheet tabs
      let rowGroupName = rowGroupNameCandidate;
      const yearString = String(effectiveYearGroup).match(/\d+/)?.[0] || String(effectiveYearGroup);
      if (rowGroupNameCandidate === yearString && rowSheetName && rowSheetName !== rowGroupNameCandidate) {
        rowGroupName = null;
      }
      const effectiveGroupName = rowGroupName || rowSheetName || groupName;

      // Derive year group from group name if possible (e.g., "10R" -> "10 IGCSE")
      if (effectiveGroupName) {
        const match = effectiveGroupName.match(/^(\d+)/);
        if (match) {
          const yearNum = parseInt(match[1]);
          if (yearNum === 10) effectiveYearGroup = '10 IGCSE';
          else if (yearNum === 11) effectiveYearGroup = '11 IGCSE';
          else if (yearNum === 12) effectiveYearGroup = '12 IB';
          else if (yearNum === 13) effectiveYearGroup = '13 IB';
          else if (yearNum >= 7 && yearNum <= 9) effectiveYearGroup = yearNum as YearGroup;
        }
      }

      // Also ensure group record exists for this effectiveGroupName
      if (effectiveGroupName) {
        const gKey = `${String(effectiveYearGroup)}|${effectiveGroupName}|${selectedAcademicYear}`;
        const groupKeys = new Set(newGroups.map(g => `${String(g.yearGroup)}|${g.name}|${g.academicYear}`));
        if (!groupKeys.has(gKey)) {
          const groupId = `group_${effectiveYearGroup}_${effectiveGroupName}_${selectedAcademicYear}`.replace(/\s+/g, '_');
          newGroups.push({
            id: groupId,
            yearGroup: effectiveYearGroup,
            name: effectiveGroupName,
            academicYear: selectedAcademicYear
          });
        }
      }

      const baselineRaw = findValue(row, [
        'baseline', 'baselinegrade', 'baseline grade', 'target', 'targetgrade', 'predicted', 
        'end of ks2', 'ks2', 'ks3', 'cats', 'midyis', 'yellis', 'working towards', 'expectation', 
        defaultSubject, 'Comp Sci', 'CS', 'ICT', 'Computer Science'
      ]);
      const baselineGrade = baselineRaw ? String(baselineRaw).trim().toUpperCase() : undefined;

      // Ensure student exists
      let student = newStudents.find(s => {
        const normalize = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const sName = normalize(s.name);
        const rName = normalize(studentName);
        
        let isNameMatch = false;
        if (sName === rName) {
          isNameMatch = true;
        } else {
          const parts = studentName.toLowerCase().split(/\s+/).filter(p => p.length > 1);
          if (parts.length >= 2) {
            const first = normalize(parts[0]);
            const last = normalize(parts[parts.length - 1]);
            // Check if both first and last name chunks are present in the stored name
            if (sName.includes(first) && sName.includes(last)) {
              isNameMatch = true;
            }
          }
        }
        
        // Match year group strictly. 
        // If we find a name match in the SAME year group but DIFFERENT groupName, 
        // we'll consider it a match to avoid duplicates across sets.
        return isNameMatch && normYear(s.yearGroup) === normYear(effectiveYearGroup) && s.academicYear === selectedAcademicYear;
      });
      if (!student) {
        const studentId = `student_${studentName}_${effectiveGroupName}_${selectedAcademicYear}`.replace(/\s+/g, '_').toLowerCase();
        student = { 
          id: studentId, 
          name: studentName, 
          preferredName: String(preferredName).trim(),
          academicHouse: String(academicHouse).trim(),
          yearGroup: effectiveYearGroup,
          groupName: effectiveGroupName,
          academicYear: selectedAcademicYear,
          isNew: isNew,
          notes: studentNotes,
          baselineGrade: baselineGrade,
          ibLevel: (effectiveYearGroup === '12 IB' || effectiveYearGroup === '13 IB') ? rowLevel : undefined
        } as any;
        newStudents.push(student);
      } else {
        if (student.groupName !== effectiveGroupName) {
          student.groupName = effectiveGroupName;
        }
        if (preferredName) {
          student.preferredName = String(preferredName).trim();
        }
        if (academicHouse) {
          student.academicHouse = String(academicHouse).trim();
        }
        if (isNewRaw !== undefined) {
          student.isNew = isNew;
        }
        if (studentNotes) {
          student.notes = studentNotes;
        }
        if (baselineGrade) {
          student.baselineGrade = baselineGrade;
        }
        if (rowLevel && (effectiveYearGroup === '12 IB' || effectiveYearGroup === '13 IB')) {
          student.ibLevel = rowLevel;
        }
      }

      // Store subject level on student if provided (e.g. Physics: HL)
      if (rowSubjectOverride && rowLevel) {
        const subjectKey = rowSubjectOverride.trim();
        const existing = (student as any).subjectLevels || {};
        (student as any).subjectLevels = { ...existing, [subjectKey]: rowLevel };
      }

      // Update subjects list on student from this row's subject
      if (rowSubjectOverride) {
        const subj = rowSubjectOverride.trim();
        const existingSubjects: string[] = (student as any).subjects || [];
        if (!existingSubjects.includes(subj)) {
          (student as any).subjects = [...existingSubjects, subj];
        }
      }

      if (hasAssessmentNameColumn) {
        // Row-based assessments
        const rowAssessmentName = findValue(row, ['assessmentname']) || defaultAssessmentName;
        const rowSubject = findValue(row, ['subject']) || defaultSubject;
        const rowMaxMarks = parseFloat(findValue(row, ['maxmarks'])) || defaultMaxMarks;
        const rowDate = findValue(row, ['date']) || defaultDate;
        const rowScoreRaw = parseFloat(findValue(row, ['score', 'mark'])) || 0;
        const rowScore = Math.min(rowMaxMarks, Math.max(0, rowScoreRaw));

        let assessment = newAssessments.find(a => a.name.trim().toLowerCase() === rowAssessmentName.trim().toLowerCase() && a.yearGroup === yearGroup && a.subject === rowSubject && a.academicYear === selectedAcademicYear);
        if (!assessment) {
          const assessmentId = `assessment_${rowAssessmentName}_${rowSubject}_${yearGroup}_${selectedAcademicYear}`.replace(/\s+/g, '_').toLowerCase();
          assessment = {
            id: assessmentId,
            name: rowAssessmentName,
            subject: rowSubject,
            maxMarks: rowMaxMarks,
            date: rowDate,
            yearGroup,
            academicYear: selectedAcademicYear
          };
          newAssessments.push(assessment);
        }

        const existingMarkIdx = newMarks.findIndex(m => m.studentId === student!.id && m.assessmentId === assessment!.id);
        if (existingMarkIdx !== -1) {
          newMarks[existingMarkIdx].score = rowScore;
        } else {
          newMarks.push({ 
            id: getMarkId(student!.id, assessment.id),
            studentId: student!.id, 
            assessmentId: assessment.id, 
            score: rowScore 
          });
        }
      } else if (scoreColumns.length > 0) {
        // Column-based assessments
        scoreColumns.forEach(col => {
          if (row[col] === undefined || row[col] === null || row[col] === '') return;
          
          const rawVal = String(row[col]).trim();
          
          // Detect explicit absent markers
          const isAbsent = /^(absent|abs|a\/a|n\/a|na|-)$/i.test(rawVal);
          
          // Skip non-numeric, non-absent values (e.g. "new", "tbd")
          if (!isAbsent && isNaN(parseFloat(rawVal))) return;

          const rowScoreRaw = isAbsent ? 0 : parseFloat(rawVal);
          const { name: rowAssessmentName, maxMarks: rowMaxMarks, subjectFromHeader } = extractInfo(col, isFirstRowSubHeader ? firstRow : null, rowSheetName);
          const rowScore = isAbsent ? 0 : Math.min(rowMaxMarks, Math.max(0, rowScoreRaw));
          // Subject priority: 1) encoded in column header ("Assessment - Physics (35)")
          //                   2) per-row Subject/Subjects column (only if single subject)
          //                   3) import config default
          const rowSubjectRaw = rowSubjectOverride ? rowSubjectOverride.trim() : defaultSubject;
          const subjectsAreMultiple = rowSubjectRaw.includes(',');
          // Subject priority:
          // 1. Encoded in column header: "Programming - Computer Science(35)"
          // 2. User assigned per-column in the import preview UI (importColumnSubjects)
          // 3. Per-row Subject column (only if single subject, not comma-separated list)
          // 4. Global import config subject (fallback)
          const rowSubject = subjectFromHeader 
            || importColumnSubjects[col]
            || (subjectsAreMultiple ? defaultSubject : rowSubjectRaw);
          const rowDate = defaultDate;

          // Match assessment: name + subject + yearGroup + academicYear
          // Use String() comparison to handle type mismatches
          let assessment = newAssessments.find(a => 
            a.name.trim().toLowerCase() === rowAssessmentName.trim().toLowerCase() && 
            String(a.yearGroup) === String(yearGroup) && 
            a.subject === rowSubject && 
            a.academicYear === selectedAcademicYear
          );
          if (!assessment) {
            const assessmentId = `assessment_${rowAssessmentName}_${rowSubject}_${yearGroup}_${selectedAcademicYear}`.replace(/\s+/g, '_').toLowerCase();
            assessment = {
              id: assessmentId,
              name: rowAssessmentName,
              subject: rowSubject,
              maxMarks: rowMaxMarks,
              date: rowDate,
              yearGroup,
              academicYear: selectedAcademicYear
            };
            newAssessments.push(assessment);
          } else {
            // Update maxMarks if the header specifies a different value
            if (rowMaxMarks !== defaultMaxMarks) {
              assessment.maxMarks = rowMaxMarks;
            }
          }

          // Update existing mark or add new one; handle absent flag
          const existingMarkIdx = newMarks.findIndex(m => m.studentId === student!.id && m.assessmentId === assessment!.id);
          if (existingMarkIdx !== -1) {
            if (isAbsent) {
              (newMarks[existingMarkIdx] as any).absent = true;
              newMarks[existingMarkIdx].score = 0;
            } else {
              newMarks[existingMarkIdx].score = rowScore;
              delete (newMarks[existingMarkIdx] as any).absent;
            }
          } else {
            const id = getMarkId(student!.id, assessment.id);
            newMarks.push(isAbsent
              ? { id, studentId: student!.id, assessmentId: assessment.id, score: 0, absent: true } as any
              : { id, studentId: student!.id, assessmentId: assessment.id, score: rowScore }
            );
          }
        });
      } else {
        // Single assessment fallback
        const rowScoreRaw = parseFloat(findValue(row, ['score', 'mark'])) || 0;
        const rowScore = Math.min(defaultMaxMarks, Math.max(0, rowScoreRaw));
        let assessment = newAssessments.find(a => a.name.trim().toLowerCase() === defaultAssessmentName.trim().toLowerCase() && a.yearGroup === yearGroup && a.academicYear === selectedAcademicYear);
        if (!assessment) {
          const assessmentId = `assessment_${defaultAssessmentName}_${defaultSubject}_${yearGroup}_${selectedAcademicYear}`.replace(/\s+/g, '_').toLowerCase();
          assessment = { 
            id: assessmentId, 
            name: defaultAssessmentName, 
            subject: defaultSubject, 
            maxMarks: defaultMaxMarks,
            date: defaultDate,
            yearGroup,
            academicYear: selectedAcademicYear
          };
          newAssessments.push(assessment);
        }

        const existingMarkIdx = newMarks.findIndex(m => m.studentId === student!.id && m.assessmentId === assessment!.id);
        if (existingMarkIdx !== -1) {
          newMarks[existingMarkIdx].score = rowScore;
        } else {
          newMarks.push({ 
            id: getMarkId(student!.id, assessment.id),
            studentId: student!.id, 
            assessmentId: assessment.id, 
            score: rowScore 
          });
        }
      }
    });

    setGroups(newGroups);
    setStudents(newStudents);
    setAssessments(newAssessments);
    setMarks(newMarks);
    
    if (useCloudSync) {
       // Save to Firebase in background
       const saveCloud = async () => {
         await Promise.all([
           ...newGroups.map(g => fbAddGroup(g)),
           ...newStudents.map(s => fbAddStudent(s)),
           ...newAssessments.map(a => fbAddAssessment(a)),
           ...newMarks.map(m => fbSetMark(m))
         ]);
       };
       saveCloud();
    }
    
    const newStudentCount = newStudents.length - students.length;
    const newAssessmentCount = newAssessments.length - assessments.length;
    const newMarkCount = newMarks.length - marks.length;
    
    setShowImportModal(false);
    setPendingImport(null);
    setImportPreview(null);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 3000);

    // Show summary alert
    const parts = [];
    if (newStudentCount > 0) {
      parts.push(`${newStudentCount} new student${newStudentCount > 1 ? 's' : ''}`);
    } else {
      parts.push('Student records updated');
    }
    if (newAssessmentCount > 0) parts.push(`${newAssessmentCount} new assessment${newAssessmentCount > 1 ? 's' : ''}`);
    if (newMarkCount > 0) parts.push(`${newMarkCount} mark${newMarkCount > 1 ? 's' : ''} added/updated`);
    
    setConfirmModal({
      isOpen: true,
      title: 'Import Successful',
      message: 'Import complete: ' + parts.join(', ') + '.',
      onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      confirmText: 'Great',
      type: 'info'
    });
  };

  // Dry-run the import to show a preview of what will be created/updated
  const previewImport = () => {
    if (!pendingImport) return;
    const { data } = pendingImport;
    const { yearGroup, subject: defaultSubject, maxMarks: defaultMaxMarks } = importConfig;

    const normalizeKey = (key: string | number) => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    const findValue = (row: any, possibleKeys: string[]) => {
      const rowKeys = Object.keys(row);
      const normalizedPossible = possibleKeys.map(k => normalizeKey(k));
      const foundKey = rowKeys.find(rk => normalizedPossible.includes(normalizeKey(rk)));
      return foundKey ? row[foundKey] : undefined;
    };

    const metadataKeys = [
      'studentname', 'name', 'student', 'fullname', 'pupil', 'pupilname',
      'surname', 'lastname', 'forename', 'firstname', 'forenamefirstname',
      'yeargroup', 'year', 'yeargroupnc', 'groupname', 'group', 'class', 'yeargroupcode',
      'academichouse', 'house',
      'subject', 'subjects', 'level', 'iblevel', 'date', 'maxmarks', 'assessmentname', 'score', 'mark',
      'upn', 'uln', 'gender', 'dob', 'sen', 'pp', 'fsm', 'eal', 'ethnicity', 'notes', 'comments',
      'attendance', 'email', 'id', 'mis_id', 'sheetname'
    ];

    const headers: string[] = Array.from(new Set(data.flatMap((row: any) => Object.keys(row))));
    const scoreColumns = headers.filter(h => {
      const nh = normalizeKey(h);
      if (metadataKeys.includes(nh)) return false;
      if (nh.startsWith('empty')) return false; // Ignore __EMPTY_n columns
      
      // Include column if it has numeric data OR if header contains "(N)" max-marks pattern
      // This catches assessment columns that are all-empty (e.g. not yet marked)
      if (/\(\d+\)/.test(h)) return true;
      return data.some((row: any) => {
        const v = row[h];
        return v !== undefined && v !== null && v !== '' && !isNaN(parseFloat(String(v).trim()));
      });
    });

    // Discover assessments from column headers
    const assessmentNames: string[] = scoreColumns.map(col => {
      const marksMatch = col.match(/\((\d+)\)/);
      let name = marksMatch ? col.replace(marksMatch[0], '').trim() : col;
      // Strip subject suffix if present
      const dashMatch = name.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      const allSubjects = ['Computer Science'];
      if (dashMatch && allSubjects.some(s => s.toLowerCase() === dashMatch[2].trim().toLowerCase())) {
        name = dashMatch[1].trim();
      }
      const maxMarks = marksMatch ? parseInt(marksMatch[1]) : defaultMaxMarks;
      // Find subject
      let subject = defaultSubject;
      if (dashMatch) {
        const possSubj = dashMatch[2].trim();
        const matched = allSubjects.find(s => s.toLowerCase() === possSubj.toLowerCase());
        if (matched) subject = matched;
      }
      return `${name} (${subject}, ${maxMarks} marks)`;
    });

    const studentNames = new Set<string>();
    const detectedGroups = new Set<string>();
    let markCount = 0;
    data.forEach((row: any) => {
      let nameRaw = findValue(row, ['studentname', 'name', 'student', 'fullname', 'pupil', 'pupilname']);
      if (!nameRaw) {
        const surname = findValue(row, ['surname', 'lastname', 'last name', 'familyname']);
        const forename = findValue(row, ['forename', 'firstname', 'first name', 'forename firstname', 'givenname', 'forename']);
        if (surname || forename) {
          nameRaw = `${String(forename || '').trim()} ${String(surname || '').trim()}`.trim();
        }
      }
      if (!nameRaw) return;
      studentNames.add(String(nameRaw).trim());
      // Detect group from the Group column or sheet name
      const groupFromCol = findValue(row, ['group', 'class', 'groupname', 'yeargroupcode', 'reggroup', 'registrationgroup', 'classcode', 'section']) || '';
      const groupFromSheet = row.__sheetName ? String(row.__sheetName).trim() : '';
      
      // Smart group detection mirroring handleImport
      let groupVal = String(groupFromCol).trim() || groupFromSheet;
      const yearStrMatch = String(yearGroup).match(/\d+/);
      const yearStr = yearStrMatch ? yearStrMatch[0] : String(yearGroup);
      if (groupVal === yearStr && groupFromSheet && groupFromSheet !== groupVal && groupFromSheet !== 'Sheet1') {
        groupVal = groupFromSheet;
      }

      if (groupVal && groupVal !== 'null' && groupVal !== 'undefined') detectedGroups.add(groupVal);
      scoreColumns.forEach(id => {
        const v = row[id];
        if (v !== undefined && v !== null && v !== '' && !isNaN(parseFloat(String(v).trim()))) markCount++;
      });
    });

    // Build per-column subject assignments (auto-detected from header or blank)
    const colSubjects: Record<string, string> = {};
    scoreColumns.forEach(col => {
      const marksMatch = col.match(/\((\d+)\)/);
      let name = marksMatch ? col.replace(marksMatch[0], '').trim() : col;
      const dashMatch = name.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      const allSubjects = ['Computer Science'];
      if (dashMatch && allSubjects.some(s => s.toLowerCase() === dashMatch[2].trim().toLowerCase())) {
        colSubjects[col] = allSubjects.find(s => s.toLowerCase() === dashMatch[2].trim().toLowerCase())!;
      } else {
        colSubjects[col] = defaultSubject; // Default to importConfig.subject
      }
    });
    setImportColumnSubjects(colSubjects);

    setImportPreview({
      assessments: assessmentNames,
      students: studentNames.size,
      marks: markCount,
      groups: Array.from(detectedGroups).sort()
    });
  };

  const handleAddAssessment = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAssessmentId) {
      const updated = { ...newAssessment };
      setAssessments(prev => prev.map(a => 
        a.id === editingAssessmentId ? { ...a, ...updated } : a
      ));
      if (useCloudSync) fbUpdateAssessment(editingAssessmentId, updated);
    } else {
      const id = Math.random().toString(36).substr(2, 9);
      const assessment: Assessment = {
        id,
        ...newAssessment,
        academicYear: selectedAcademicYear
      };
      setAssessments(prev => [...prev, assessment]);
      if (useCloudSync) fbAddAssessment(assessment);
    }
    setShowAssessmentModal(false);
    setEditingAssessmentId(null);
    setNewAssessment(prev => ({ 
      ...prev,
      name: '', 
      // Keep subject, maxMarks, date, and yearGroup for convenience
    }));
  };

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    // If no subjects explicitly set, default to all subjects for the year group
    const studentSubjects = (newStudent as any).subjects?.length
      ? (newStudent as any).subjects
      : SUBJECTS_BY_YEAR[newStudent.yearGroup] || [];
    const studentSubjectLevels = (newStudent as any).subjectLevels || {};

    const isIB = newStudent.yearGroup === '12 IB' || newStudent.yearGroup === '13 IB';

    if (editingStudentId) {
      const updated = {
        ...newStudent,
        subjects: studentSubjects,
        subjectLevels: isIB ? studentSubjectLevels : undefined,
        ibLevel: isIB ? newStudent.ibLevel : undefined
      };
      setStudents(prev => prev.map(s => s.id === editingStudentId ? {
        ...s,
        ...updated
      } : s));
      if (useCloudSync) fbUpdateStudent(editingStudentId, updated);
      setEditingStudentId(null);
    } else {
      const id = Math.random().toString(36).substr(2, 9);
      const student: Student = {
        id,
        ...newStudent,
        academicYear: selectedAcademicYear,
        subjects: studentSubjects,
        subjectLevels: isIB ? studentSubjectLevels : undefined,
        ibLevel: isIB ? newStudent.ibLevel : undefined
      };
      setStudents(prev => [...prev, student]);
      if (useCloudSync) fbAddStudent(student);
    }
    
    setShowStudentModal(false);
    setNewStudent(prev => ({ ...prev, name: '', preferredName: '', ibLevel: undefined, isNew: false, notes: '', baselineGrade: '', subjects: undefined, subjectLevels: undefined } as any)); // Keep yearGroup and groupName
  };

  const handleAddGrade = (isAssessment: boolean = false, assessmentId?: string) => {
    if (isAssessment && assessmentId) {
      setAssessments(prev => prev.map(a => {
        if (a.id === assessmentId) {
          const studentId = marks.find(m => m.assessmentId === a.id)?.studentId;
          const yearGroup = students.find(s => s.id === studentId)?.yearGroup || 7;
          const currentBoundaries = a.boundaries || [...(yearBoundaries[yearGroup] || [])];
          return { ...a, boundaries: [...currentBoundaries, { grade: 'New', minPercentage: 0 }] };
        }
        return a;
      }));
    } else {
      setYearBoundaries(prev => ({
        ...prev,
        [selectedSettingScope]: [...(prev[selectedSettingScope] || []), { grade: 'New', minPercentage: 0 }]
      }));
    }
  };

  const handleMarkAbsent = (studentId: string, assessmentId: string, absent: boolean) => {
    const existingMark = marks.find(m => m.studentId === studentId && m.assessmentId === assessmentId);
    
    if (absent) {
      const newScore = 0;
      if (existingMark) {
        const updated = { ...existingMark, absent: true, score: newScore };
        setMarks(prev => prev.map(m => m.id === existingMark.id ? updated : m));
        if (useCloudSync) fbSetMark(updated);
      } else {
        const id = getMarkId(studentId, assessmentId);
        const mark = { id, studentId, assessmentId, score: newScore, absent: true } as any;
        setMarks(prev => [...prev, mark]);
        if (useCloudSync) fbSetMark(mark);
      }
    } else {
      if (existingMark) {
        if (existingMark.score === 0) {
          fbDeleteMark(existingMark.id);
          setMarks(prev => prev.filter(m => m.id !== existingMark.id));
        } else {
          const updated = { ...existingMark };
          delete (updated as any).absent;
          setMarks(prev => prev.map(m => m.id === existingMark.id ? updated : m));
          if (useCloudSync) fbSetMark(updated);
        }
      }
    }
  };

  const handleUpdateMark = (studentId: string, assessmentId: string, score: number | null) => {
    const existingMark = marks.find(m => m.studentId === studentId && m.assessmentId === assessmentId);
    
    if (score === null || isNaN(score)) {
      if (existingMark) {
        if (existingMark.resitScore === undefined) {
           fbDeleteMark(existingMark.id);
           setMarks(prev => prev.filter(m => m.id !== existingMark.id));
        } else {
           setMarks(prev => prev.map(m => m.id === existingMark.id ? { ...m, score: 0 } : m));
        }
      }
      return;
    }

    const assessment = assessments.find(a => a.id === assessmentId);
    const maxMarks = assessment?.maxMarks || 100;
    const validatedScore = Math.min(maxMarks, Math.max(0, score));
    
    if (existingMark) {
      const updated = { ...existingMark, score: validatedScore };
      setMarks(prev => prev.map(m => m.id === existingMark.id ? updated : m));
      if (useCloudSync) fbSetMark(updated);
    } else {
      const id = getMarkId(studentId, assessmentId);
      const mark = { 
        id,
        studentId, 
        assessmentId, 
        score: validatedScore 
      };
      setMarks(prev => [...prev, mark]);
      if (useCloudSync) fbSetMark(mark);
    }
  };

  const handleUpdateMarkByPercentage = (studentId: string, assessmentId: string, percentage: number | null) => {
    const assessment = assessments.find(a => a.id === assessmentId);
    if (!assessment) return;
    
    if (percentage === null || isNaN(percentage)) {
      handleUpdateMark(studentId, assessmentId, null);
      return;
    }
    
    const validatedPercentage = Math.min(100, Math.max(0, percentage));
    const score = (validatedPercentage / 100) * assessment.maxMarks;
    handleUpdateMark(studentId, assessmentId, score);
  };

  const handleUpdateMarkByGrade = (studentId: string, assessmentId: string, grade: string) => {
    const assessment = assessments.find(a => a.id === assessmentId);
    const student = students.find(s => s.id === studentId);
    if (!assessment || !student) return;
    
    // Get applicable boundaries
    const boundaries = assessment.boundaries || getStudentBoundaries(student);
    const b = boundaries.find(b => b.grade === grade);
    
    if (b) {
      // Set to the minPercentage of that grade (plus a tiny bit to avoid floating point boundary issues)
      const score = ((b.minPercentage + 0.1) / 100) * assessment.maxMarks;
      handleUpdateMark(studentId, assessmentId, score);
    }
  };

  const handleUpdateResitMark = (studentId: string, assessmentId: string, resitScore: number | null) => {
    const existingMark = marks.find(m => m.studentId === studentId && m.assessmentId === assessmentId);
    
    if (resitScore === null || isNaN(resitScore)) {
      if (existingMark) {
        const updated = { ...existingMark };
        delete (updated as any).resitScore;
        setMarks(prev => prev.map(m => m.id === existingMark.id ? updated : m));
        if (useCloudSync) fbSetMark(updated);
      }
      return;
    }

    const assessment = assessments.find(a => a.id === assessmentId);
    const maxMarks = (existingMark as any)?.resitMaxMarks || assessment?.maxMarks || 100;
    const validatedScore = Math.min(maxMarks, Math.max(0, resitScore));
    
    if (existingMark) {
      const updated = { ...existingMark, resitScore: validatedScore };
      setMarks(prev => prev.map(m => m.id === existingMark.id ? updated : m));
      if (useCloudSync) fbSetMark(updated);
    } else {
      const id = getMarkId(studentId, assessmentId);
      const mark = { 
        id,
        studentId, 
        assessmentId, 
        score: 0,
        resitScore: validatedScore 
      };
      setMarks(prev => [...prev, mark]);
      if (useCloudSync) fbSetMark(mark);
    }
  };

  const handleUpdateResitMax = (studentId: string, assessmentId: string, resitMax: number | null) => {
    const existingMark = marks.find(m => m.studentId === studentId && m.assessmentId === assessmentId);
    
    if (resitMax === null || isNaN(resitMax)) {
      if (existingMark) {
        const updated = { ...existingMark };
        delete (updated as any).resitMaxMarks;
        setMarks(prev => prev.map(m => m.id === existingMark.id ? updated : m));
        if (useCloudSync) fbSetMark(updated);
      }
      return;
    }

    if (existingMark) {
      const updated = { ...existingMark, resitMaxMarks: resitMax };
      setMarks(prev => prev.map(m => m.id === existingMark.id ? updated : m));
      if (useCloudSync) fbSetMark(updated);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'on-track': return 'text-blue-600 bg-blue-50 border-blue-100';
      case 'needs-improvement': return 'text-rose-600 bg-rose-50 border-rose-100';
      case 'no-data': return 'text-slate-400 bg-slate-50 border-slate-100';
      default: return 'text-slate-600 bg-slate-50 border-slate-100';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'declining': return <TrendingDown className="w-4 h-4 text-rose-500" />;
      default: return <Minus className="w-4 h-4 text-slate-400" />;
    }
  };

  if (isSystemLoading || isInitialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading tracker...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">CS Data Tracker</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Computer Science Department</p>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
            {[
              { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
              { id: 'performance', icon: TrendingUp, label: 'Performance' },
              { id: 'students', icon: Users, label: 'Students' },
              { id: 'concerns', icon: AlertCircle, label: 'Concerns' },
              { id: 'assessments', icon: Plus, label: 'Assessments' },
              { id: 'settings', icon: Settings, label: 'Settings' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="md:hidden flex items-center bg-indigo-600 text-white px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider">
            {activeTab}
          </div>

          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
              useCloudSync 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                : 'bg-slate-100 border-slate-200 text-slate-400'
            }`}>
              <Cloud className={`w-3.5 h-3.5 ${useCloudSync ? 'animate-pulse' : ''}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {useCloudSync ? 'Cloud Synced' : 'Offline Mode'}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Academic Year</span>
              <select 
                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                value={selectedAcademicYear}
                onChange={(e) => {
                  const oldYear = selectedAcademicYear;
                  const newYear = e.target.value;
                  setSelectedAcademicYear(newYear);
                  
                  // If moving forward one year, try to follow the cohort
                  if (getNextAcademicYear(oldYear) === newYear) {
                    const nextYG = getNextYearGroup(yearFilter as YearGroup);
                    if (nextYG) setYearFilter(nextYG);
                  } 
                  // If moving backward one year, try to follow back
                  else if (getPreviousAcademicYear(oldYear) === newYear) {
                    const prevYG = getPreviousYearGroup(yearFilter as YearGroup);
                    if (prevYG) setYearFilter(prevYG);
                  }
                }}
              >
                {ACADEMIC_YEARS.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Year Group</span>
              <select 
                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                value={yearFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'all') setYearFilter('all');
                  else if (!isNaN(parseInt(val)) && val.length === 1) setYearFilter(parseInt(val) as YearGroup);
                  else setYearFilter(val as YearGroup);
                  setGroupFilter('all'); // Reset group filter when year changes
                  setPerformanceSubjectFilter('all'); // Reset subject filter when year changes
                }}
              >
                <option value="IGCSE_ALL">IGCSE (All)</option>
                <option value="IB_ALL">IB (All)</option>
                {[7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'].map(y => (
                  <option key={y} value={y}>{y === 'Graduated' ? 'Alumni / Graduated' : (typeof y === 'number' ? `Year ${y}` : y)}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Group</span>
              <select 
                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option value="all">All Groups</option>
                {availableGroups.map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </div>
            {(String(yearFilter).includes('IB') || yearFilter === 'IB_ALL') && (
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">IB Level</span>
                <select 
                  className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                  value={ibLevelFilter}
                  onChange={(e) => setIbLevelFilter(e.target.value as any)}
                >
                  <option value="all">Both HL/SL</option>
                  <option value="HL">HL Only</option>
                  <option value="SL">SL Only</option>
                </select>
              </div>
            )}
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject</span>
              <select 
                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                value={performanceSubjectFilter}
                onChange={(e) => setPerformanceSubjectFilter(e.target.value)}
              >
                <option value="all">All Subjects</option>
                {Array.from(new Set(
                  // Only show subjects that actually have assessments in the selected year
                  assessments
                    .filter(a => a.academicYear === selectedAcademicYear && matchesYearFilter(a.yearGroup, yearFilter))
                    .map(a => a.subject)
                    // Fall back to theoretical subjects if no assessments exist yet
                    .concat(
                      yearFilter === 'all' ? Object.values(SUBJECTS_BY_YEAR).flat() :
                      yearFilter === 'IGCSE_ALL' ? [...SUBJECTS_BY_YEAR['10 IGCSE'], ...SUBJECTS_BY_YEAR['11 IGCSE']] :
                      yearFilter === 'IB_ALL' ? [...SUBJECTS_BY_YEAR['12 IB'], ...SUBJECTS_BY_YEAR['13 IB']] :
                      SUBJECTS_BY_YEAR[yearFilter as YearGroup] || []
                    )
                )).map(subject => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </div>
            <button 
              onClick={backupData}
              className="btn-secondary flex items-center gap-2 text-sm"
              title="Backup All Data"
            >
              <Download className="w-4 h-4" />
              Backup
            </button>
            <label className="btn-secondary flex items-center gap-2 cursor-pointer text-sm">
              <Upload className="w-4 h-4" />
              Restore
              <input type="file" accept=".json" onChange={restoreBackup} className="hidden" />
            </label>
            <button 
              onClick={downloadTemplate}
              className="btn-secondary flex items-center gap-2 text-sm"
              title="Download CSV Template"
            >
              <Download className="w-4 h-4" />
              Template
            </button>
            <label className="btn-secondary flex items-center gap-2 cursor-pointer text-sm">
              <Upload className="w-4 h-4" />
              Upload CSV/Excel
              <input id="file-upload" type="file" accept=".csv,.xlsx,.xls" multiple onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full pb-24 md:pb-6">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="card p-6 flex flex-col justify-between bg-gradient-to-br from-white to-slate-50">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Students</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900 leading-none mb-1">{filteredPerformances.length}</h2>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {yearFilter === 'all' 
                        ? `Across ${new Set(students.filter(s => s.academicYear === selectedAcademicYear).map(s => s.yearGroup)).size} year groups`
                        : yearFilter === 'IGCSE_ALL' ? 'All IGCSE Students'
                        : yearFilter === 'IB_ALL' ? 'All IB Students'
                        : `In ${formatYearGroup(yearFilter as YearGroup)}`}
                    </p>
                  </div>
                </div>

                <div className="card p-6 flex flex-col justify-between bg-gradient-to-br from-white to-slate-50">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg. Performance</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900 leading-none mb-1">
                      {(() => {
                        const withData = filteredPerformances.filter(p => (p as any).hasData);
                        return withData.length > 0
                          ? `${(withData.reduce((acc, p) => acc + p.averagePercentage, 0) / withData.length).toFixed(1)}%`
                          : '—';
                      })()}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {yearFilter === 'all' ? 'School-wide average' 
                        : yearFilter === 'IGCSE_ALL' ? 'IGCSE average'
                        : yearFilter === 'IB_ALL' ? 'IB average'
                        : `${formatYearGroup(yearFilter as YearGroup)} average`}
                    </p>
                  </div>
                </div>

                <div className="card p-6 flex flex-col justify-between bg-gradient-to-br from-white to-slate-50">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Assessments</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                      <BarChart3 className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900 leading-none mb-1">
                      {assessments.filter(a => a.academicYear === selectedAcademicYear && matchesYearFilter(a.yearGroup, yearFilter)).length}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {yearFilter === 'all' ? 'Total recorded tests' : 
                       yearFilter === 'IGCSE_ALL' ? 'Total IGCSE tests' :
                       yearFilter === 'IB_ALL' ? 'Total IB tests' :
                       `Tests for ${formatYearGroup(yearFilter as YearGroup)}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => { setActiveTab('assessments'); setShowAssessmentModal(true); }}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl shadow-lg shadow-indigo-100 transition-all group text-left flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-bold text-indigo-200 uppercase tracking-widest">Quick Action</span>
                      <Plus className="w-4 h-4 text-white group-hover:rotate-90 transition-transform" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold leading-tight">Create New Assessment</h3>
                      <p className="text-[9px] text-indigo-200 font-medium mt-0.5">Record marks manually</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => document.getElementById('file-upload')?.click()}
                    className="flex-1 bg-white hover:bg-slate-50 text-slate-900 p-4 rounded-2xl border border-slate-200 shadow-sm transition-all group text-left flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Quick Action</span>
                      <Upload className="w-4 h-4 text-indigo-600 group-hover:-translate-y-1 transition-transform" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold leading-tight">Import Data</h3>
                      <p className="text-[9px] text-slate-500 font-medium mt-0.5">Upload Excel spreadsheet</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Calculation Notes */}
              <div className="card p-4 bg-indigo-50/50 border-indigo-100/50">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-indigo-900 mb-1">Data Calculation Notes</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
                      <div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Absent Students</p>
                        <p className="text-xs text-indigo-800 leading-relaxed">
                          Assessments marked as <strong>Absent</strong> are excluded from the average calculation. They do not count as 0%; they are simply ignored to ensure the average reflects actual performance.
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">New Students</p>
                        <p className="text-xs text-indigo-800 leading-relaxed">
                          Students with no recorded marks (or only absent marks) will display as <strong>"No data"</strong>. Their statistics will begin appearing as soon as their first assessment score is entered.
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Average Logic</p>
                        <p className="text-xs text-indigo-800 leading-relaxed">
                          All averages are calculated as the mean of percentages across all assessments the student has sat. This provides a fair comparison regardless of the maximum marks of each test.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Logic Documentation Section */}
                <div className="lg:col-span-3">
                  <div className="card bg-indigo-50/30 border-indigo-100 p-6 flex flex-col md:flex-row gap-6 md:items-center">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                      <HelpCircle className="w-6 h-6" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                          Top Performers Logic
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Students with an average at or above the highest defined Grade Boundary 
                          (e.g., Grade 7, A*, or Exceeding). Students flagged for support are automatically excluded from this list.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-2">
                          <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                          Needs Support Logic
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Students whose average falls below the target threshold. Triggered if average is 
                          below <strong>Grade 5</strong> (IB/IGCSE) or below <strong>"At"</strong> (KS3). 
                          Also flags students with declining trends just above the threshold.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {filteredPerformances.length === 0 ? (
                  <div className="lg:col-span-3 card p-12 flex flex-col items-center justify-center text-center bg-slate-50/50 border-dashed border-2">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
                      <Users className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">No students found</h3>
                    <p className="text-sm text-slate-500 max-w-xs">
                      We couldn't find any students matching your current filters for {selectedAcademicYear}. 
                      Try changing the year group or uploading an Excel file.
                    </p>
                    <button 
                      onClick={() => document.getElementById('file-upload')?.click()}
                      className="mt-6 btn-primary flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Upload Data
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="card p-6">
                      <h3 className="text-lg font-bold text-slate-900 mb-6">Subject Performance</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subjectPerformanceData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis dataKey="subject" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} width={100} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="average" radius={[0, 4, 4, 0]} barSize={30}>
                          {subjectPerformanceData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={SUBJECT_COLORS[entry.subject] || '#6366f1'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Year Group Performance</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={classPerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} domain={[0, 100]} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: '#f8fafc' }}
                        />
                        <Bar dataKey="average" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Group Performance</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={groupPerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="group" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} domain={[0, 100]} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: '#f8fafc' }}
                        />
                        <Bar dataKey="average" fill="#818cf8" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-6 font-display tracking-tight flex items-center justify-between">
                    Performance Distribution
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1 bg-slate-50 rounded-lg">Based on {yearFilter === 'all' ? 'All Years' : yearFilter} Settings</span>
                  </h3>
                  <div className="space-y-6">
                    {gradeDistribution.map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="font-medium text-slate-700">{item.label}</span>
                          <span className="text-slate-500 font-bold">{item.count}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.count / (filteredPerformances.length || 1)) * 100}%` }}
                            className={`${item.color} h-full`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}

          {activeTab === 'concerns' && (
            <motion.div 
              key="concerns"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 font-display uppercase tracking-tight flex items-center gap-3">
                    <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 shadow-sm border border-rose-200">
                      <AlertCircle className="w-7 h-7" />
                    </div>
                    Students of Concern
                  </h2>
                  <p className="text-slate-500 text-sm font-medium mt-1">Students performing <span className="text-rose-600 font-bold">≥3 grades below</span> their baseline target.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-rose-50 px-6 py-3 rounded-2xl border border-rose-100 shadow-sm">
                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest block mb-1">Alert Count</span>
                    <span className="text-3xl font-black text-rose-700 leading-none">
                      {filteredPerformances.filter(p => (p as any).isConcern).length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredPerformances.filter(p => (p as any).isConcern).length > 0 ? (
                  filteredPerformances.filter(p => (p as any).isConcern).map(p => (
                    <motion.div 
                      key={p.student.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm border-l-8 border-l-rose-500 flex flex-col xl:flex-row xl:items-center justify-between gap-6 hover:shadow-xl transition-all"
                    >
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 border border-rose-100">
                          <Users className="w-8 h-8" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-900 leading-tight">{p.student.name}</h3>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-slate-200">
                              Year {p.student.yearGroup}
                            </span>
                            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-indigo-100">
                              {p.student.groupName}
                            </span>
                            {p.student.academicHouse && (
                              <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-amber-100">
                                {p.student.academicHouse}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-8 xl:gap-12 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                        <div className="text-center min-w-[80px]">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Baseline</p>
                          <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                            <span className="text-2xl font-black text-slate-700">{p.student.baselineGrade}</span>
                          </div>
                        </div>
                        
                        <div className="hidden sm:flex items-center justify-center">
                          <div className="w-8 h-[2px] bg-slate-200 relative">
                            <ChevronRight className="w-5 h-5 text-slate-300 absolute -right-2.5 -top-2" />
                          </div>
                        </div>

                        <div className="text-center min-w-[100px]">
                          <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1.5">Current Avg</p>
                          <div className="bg-white px-4 py-2 rounded-xl border border-rose-200 shadow-sm outline outline-2 outline-rose-500/10">
                            <span className="text-2xl font-black text-rose-600">
                              {getGrade(p.averagePercentage, getStudentBoundaries(p.student))}
                            </span>
                            <p className="text-[10px] font-bold text-rose-400 mt-1">{p.averagePercentage.toFixed(1)}%</p>
                          </div>
                        </div>

                        <div className="text-center min-w-[80px]">
                           <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1.5">Drop</p>
                           <div className="flex flex-col items-center">
                             <TrendingDown className="w-5 h-5 text-rose-500 mb-0.5" />
                             <span className="text-sm font-black text-rose-600">
                               {(p as any).baselinePoints - gradeToPoints(getGrade(p.averagePercentage, getStudentBoundaries(p.student)))} Grades
                             </span>
                           </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => { setActiveTab('performance'); setSelectedStudentForPerformance(p.student.id); }}
                          className="w-full xl:w-auto px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 group"
                        >
                          <TrendingUp className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
                          Investigate Trends
                        </button>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="card p-20 text-center bg-emerald-50/10 border-dashed border-emerald-200">
                    <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-6 text-emerald-600 shadow-inner">
                      <ShieldCheck className="w-10 h-10" />
                    </div>
                    <h3 className="text-2xl font-black text-emerald-900 mb-2 font-display uppercase tracking-tight">System Clear</h3>
                    <p className="text-emerald-700 text-sm max-w-md mx-auto font-medium">
                      No students meet the "concern" criteria for the current filters. All active students are performing within acceptable bounds of their baseline metrics.
                    </p>
                    <div className="mt-8">
                      <button 
                        onClick={() => setActiveTab('performance')}
                        className="text-xs font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-800 transition-colors underline underline-offset-4"
                      >
                        Back to general performance
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'performance' && (
            <motion.div 
              key="performance"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Performance Analytics</h2>
                  <p className="text-xs text-slate-500 font-medium">In-depth analysis of student progress and subject trends</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student</span>
                    <select 
                      className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer min-w-[150px]"
                      value={selectedStudentForPerformance}
                      onChange={(e) => setSelectedStudentForPerformance(e.target.value)}
                    >
                      <option value="none">Select Student...</option>
                      {(() => {
                        const raw = students
                          .filter(s => s.academicYear === selectedAcademicYear && matchesYearFilter(s.yearGroup, yearFilter));
                        const unique: Student[] = [];
                        const seen = new Set<string>();
                        const sorted = [...raw].sort((a,b) => {
                          if (a.groupName && !b.groupName) return -1;
                          if (!a.groupName && b.groupName) return 1;
                          return 0;
                        });
                        for (const s of sorted) {
                          const key = `${s.name.trim().toLowerCase()}|${normYear(s.yearGroup)}`;
                          if (!seen.has(key)) {
                            unique.push(s);
                            seen.add(key);
                          }
                        }
                        return unique.sort((a,b) => a.name.localeCompare(b.name)).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ));
                      })()}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject</span>
                    <select 
                      className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer min-w-[120px]"
                      value={performanceSubjectFilter}
                      onChange={(e) => {
                        setPerformanceSubjectFilter(e.target.value);
                        setPerformanceAssessmentFilter('all');
                      }}
                    >
                      <option value="all">All Subjects</option>
                      {availablePerformanceSubjects.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <BarChart3 className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assessment</span>
                    <select 
                      className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer min-w-[120px] max-w-[200px]"
                      value={performanceAssessmentFilter}
                      onChange={(e) => setPerformanceAssessmentFilter(e.target.value)}
                    >
                      <option value="all">All Assessments</option>
                      {availablePerformanceAssessments.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Display</span>
                    <select 
                      className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer min-w-[100px]"
                      value={performanceDisplayMode}
                      onChange={(e) => setPerformanceDisplayMode(e.target.value as 'percentage' | 'points')}
                    >
                      <option value="percentage">Percentage</option>
                      <option value="points">Grade Points</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card p-4 flex items-center gap-4 bg-white">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selected Average</p>
                    <h4 className="text-xl font-bold text-slate-900">
                      {performanceInsights ? performanceInsights.average.toFixed(performanceDisplayMode === 'points' ? 2 : 1) : '0.0'}
                      {performanceInsights?.labelSuffix}
                    </h4>
                  </div>
                </div>
                <div className="card p-4 flex flex-col gap-2 bg-white overflow-y-auto max-h-[85px] custom-scrollbar">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Group Averages</p>
                  </div>
                  <div className="space-y-1">
                    {performanceInsights?.allGroupAverages.map(g => (
                      <div key={g.name} className="flex justify-between items-center text-[10px] font-bold border-b border-slate-50 last:border-0 pb-0.5">
                        <span className="text-slate-600 truncate max-w-[120px]">{g.name}</span>
                        <span className="text-emerald-600">
                          {g.avg.toFixed(performanceDisplayMode === 'points' ? 2 : 1)}
                          {performanceInsights?.labelSuffix}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card p-4 flex items-center gap-4 bg-white">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Most Improved</p>
                    <h4 className="text-xl font-bold text-slate-900 truncate max-w-[150px]">{performanceInsights?.mostImproved?.name || 'N/A'}</h4>
                    <p className="text-[10px] text-amber-600 font-bold">
                      {performanceInsights?.mostImproved ? `+${performanceInsights.mostImproved.improvement.toFixed(1)}${performanceInsights.labelSuffix} Growth` : 'No growth data'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Left Column: Top Performers & Needs Support */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="card p-6 bg-gradient-to-b from-white to-emerald-50/30">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      Top Performers
                    </h3>
                    <div className="space-y-3">
                      {topPerformersList.length > 0 ? topPerformersList.map((p, idx) => (
                        <button 
                          key={`${p.student.id}-${idx}`} 
                          onClick={() => setSelectedStudentForPerformance(p.student.id)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg transition-all hover:shadow-sm border border-transparent hover:border-slate-100 ${selectedStudentForPerformance === p.student.id ? 'bg-white shadow-sm border-slate-100' : 'hover:bg-white'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-slate-300 w-4">{idx + 1}</span>
                            <div className="min-w-0 text-left">
                              <p className="text-xs font-bold text-slate-900 truncate">{p.student.name}</p>
                              <p className="text-[10px] text-slate-500">{p.student.groupName}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs font-bold text-emerald-600 bg-white px-2 py-0.5 rounded-full border border-emerald-100">
                              {(p as any).hasData ? (performanceDisplayMode === 'percentage' ? `${p.averagePercentage.toFixed(1)}%` : `${p.averagePoints.toFixed(2)} pts`) : '—'}
                            </span>
                            {(p as any).hasData && (
                              <span className="text-[10px] font-black text-slate-800 tracking-tighter">
                                {getGrade(p.averagePercentage, getStudentBoundaries(p.student))}
                              </span>
                            )}
                          </div>
                        </button>
                      )) : (
                        <p className="text-xs text-slate-400 italic text-center py-4">No data available</p>
                      )}
                    </div>
                  </div>

                  <div className="card p-6 bg-gradient-to-b from-white to-rose-50/30">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center">
                        <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                      </div>
                      Needs Support
                    </h3>
                    <div className="space-y-3">
                      {needsSupportList.length > 0 ? needsSupportList.map((p, idx) => (
                        <button 
                          key={`${p.student.id}-${idx}`} 
                          onClick={() => setSelectedStudentForPerformance(p.student.id)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg transition-all hover:shadow-sm border border-transparent hover:border-slate-100 ${selectedStudentForPerformance === p.student.id ? 'bg-white shadow-sm border-slate-100' : 'hover:bg-white'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-slate-300 w-4">{idx + 1}</span>
                            <div className="min-w-0 text-left">
                              <p className="text-xs font-bold text-slate-900 truncate">{p.student.name}</p>
                              <p className="text-[10px] text-slate-500">{p.student.groupName}</p>
                            </div>
                          </div>
                           <div className="flex flex-col items-end gap-1">
                            <span className="text-xs font-bold text-rose-600 bg-white px-2 py-0.5 rounded-full border border-rose-100">
                              {(p as any).hasData ? (performanceDisplayMode === 'percentage' ? `${p.averagePercentage.toFixed(1)}%` : `${p.averagePoints.toFixed(2)} pts`) : '—'}
                            </span>
                            {(p as any).hasData && (
                              <span className="text-[10px] font-black text-slate-800 tracking-tighter">
                                {getGrade(p.averagePercentage, getStudentBoundaries(p.student))}
                              </span>
                            )}
                          </div>
                        </button>
                      )) : (
                        <p className="text-xs text-slate-400 italic text-center py-4">No data available</p>
                      )}
                    </div>
                  </div>

                  <div className="card p-6">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-indigo-500" />
                      Grade Distribution
                    </h3>
                    <div className="space-y-4">
                      {performanceTabGradeDistribution.map((item) => (
                        <div key={item.label}>
                          <div className="flex justify-between text-[10px] mb-1.5">
                            <span className="font-bold text-slate-600 uppercase tracking-tighter">{item.label}</span>
                            <span className="text-slate-400 font-bold">{item.count} students</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(item.count / (performanceTabStats.length || 1)) * 100}%` }}
                              className={`${item.color} h-full`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column: Detailed Charts */}
                <div className="lg:col-span-3 space-y-6">
                  {selectedStudentForPerformance !== 'none' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="card p-6 border-indigo-100 bg-indigo-50/10"
                    >
                      <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center justify-between">
                        <span>
                          Individual Progress: <span className="text-indigo-600">{students.find(s => s.id === selectedStudentForPerformance)?.name}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Personal Trend</span>
                          <button 
                            onClick={() => setSelectedStudentForPerformance('none')}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={individualStudentTrendData}>
                            <defs>
                              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                              dataKey="date" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#64748b', fontSize: 11 }} 
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#64748b', fontSize: 11 }} 
                              domain={[0, 100]} 
                            />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              formatter={(value: number, name: string, props: any) => [
                                `${value.toFixed(1)}%`, 
                                `${props.payload.assessmentName} (${props.payload.subject})`
                              ]}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="score" 
                              stroke="#6366f1" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#colorScore)" 
                              dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#6366f1' }}
                              activeDot={{ r: 6, strokeWidth: 0 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>
                  )}

                  <div className="card p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center justify-between">
                      Subject Progress Trends
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Average {performanceDisplayMode === 'percentage' ? 'Score %' : 'Points'}
                          </span>
                        </div>
                      </div>
                    </h3>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={subjectTrendData.filter(d => performanceSubjectFilter === 'all' || d.subject === performanceSubjectFilter)}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748b', fontSize: 11 }}
                            tickFormatter={(date) => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748b', fontSize: 11 }} 
                            domain={[0, performanceDisplayMode === 'percentage' ? 100 : 10]} 
                            tickFormatter={(val) => performanceDisplayMode === 'percentage' ? `${val}%` : `${val}`}
                          />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: '#1e293b' }}
                            formatter={(value: number, name: string, props: any) => [
                              <span key="val" className="font-bold text-indigo-600">{value}{performanceDisplayMode === 'percentage' ? '%' : ' pts'}</span>,
                              <div key="info" className="text-[10px] text-slate-500 mt-1">
                                <p className="font-bold text-slate-700">{props.payload.name}</p>
                                <p>{props.payload.subject}</p>
                              </div>
                            ]}
                            labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                          />
                          <Legend 
                            verticalAlign="top" 
                            align="right" 
                            iconType="circle" 
                            height={36}
                            wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                          />
                          {(Array.from(new Set(subjectTrendData.map(d => d.subject))) as string[])
                            .filter(subject => performanceSubjectFilter === 'all' || subject === performanceSubjectFilter)
                            .map((subject) => (
                            <Line 
                              key={subject}
                              type="monotone" 
                              dataKey="average" 
                              data={subjectTrendData.filter(d => d.subject === subject)}
                              name={subject}
                              stroke={SUBJECT_COLORS[subject] || '#6366f1'} 
                              strokeWidth={3}
                              dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: SUBJECT_COLORS[subject] || '#6366f1' }}
                              activeDot={{ r: 6, strokeWidth: 0, fill: SUBJECT_COLORS[subject] || '#6366f1' }}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="card p-6">
                      <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center justify-between">
                        Subject Comparison
                        <BarChart3 className="w-4 h-4 text-slate-300" />
                      </h3>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={subjectPerformanceData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" domain={[0, performanceDisplayMode === 'percentage' ? 100 : 10]} hide />
                            <YAxis dataKey="subject" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={100} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              formatter={(val: number) => [`${val}${performanceDisplayMode === 'percentage' ? '%' : ' pts'}`, 'Average']}
                            />
                            <Bar dataKey="average" radius={[0, 4, 4, 0]} barSize={20}>
                              {subjectPerformanceData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={SUBJECT_COLORS[entry.subject] || '#6366f1'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="card p-6">
                      <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center justify-between">
                        Group Performance Gap
                        <Users className="w-4 h-4 text-slate-300" />
                      </h3>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={groupPerformanceData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="group" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, performanceDisplayMode === 'percentage' ? 100 : 10]} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              formatter={(val: number) => [`${val}${performanceDisplayMode === 'percentage' ? '%' : ' pts'}`, 'Average']}
                            />
                            <Bar dataKey="average" fill="#818cf8" radius={[4, 4, 0, 0]} barSize={30} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="card p-6 overflow-hidden">
                    <div className="flex flex-col gap-6 mb-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <List className="w-5 h-5 text-indigo-500" />
                          Class Marksheet Overview
                        </h3>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setMarksheetEditMode(!marksheetEditMode)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border shadow-sm ${
                              marksheetEditMode 
                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {marksheetEditMode ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                            {marksheetEditMode ? 'Finish' : 'Bulk Marks'}
                          </button>
                          {marksheetEditMode && (
                            <button 
                              onClick={() => {
                                setSaveStatus('saving');
                                setTimeout(() => setSaveStatus('saved'), 1000);
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-[11px] font-bold transition-all border border-indigo-100"
                            >
                              <Save className="w-3.5 h-3.5" />
                              Save
                            </button>
                          )}
                          <button 
                            onClick={downloadMarksheet}
                            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl text-[11px] font-bold transition-all border border-emerald-100 shadow-sm"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Export
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 items-end">
                        <div className="space-y-1.5 font-sans">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Student Name</label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                              type="text"
                              placeholder="Search..."
                              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                              value={marksheetLocalSearch}
                              onChange={(e) => setMarksheetLocalSearch(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5 font-sans">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Class Group</label>
                          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                            <Users className="w-4 h-4 text-slate-400" />
                            <select 
                              className="flex-1 bg-transparent border-none text-sm font-medium text-slate-700 outline-none focus:ring-0"
                              value={marksheetLocalGroup}
                              onChange={(e) => setMarksheetLocalGroup(e.target.value)}
                            >
                              <option value="all">All Groups</option>
                              {groups
                                .filter(g => matchesYearFilter(g.yearGroup, yearFilter))
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(g => (
                                  <option key={g.id} value={g.name}>{g.name}</option>
                                ))
                              }
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1.5 font-sans">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Assessment</label>
                          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 overflow-hidden">
                            <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <select 
                              className="flex-1 bg-transparent border-none text-sm font-medium text-slate-700 outline-none focus:ring-0 truncate max-w-[150px]"
                              value={marksheetLocalAssessment}
                              onChange={(e) => setMarksheetLocalAssessment(e.target.value)}
                            >
                              <option value="all">All Data</option>
                              {assessments
                                .filter(a => a.academicYear === selectedAcademicYear)
                                .filter(a => matchesYearFilter(a.yearGroup, yearFilter))
                                .filter(a => performanceSubjectFilter === 'all' || a.subject === performanceSubjectFilter)
                                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                                .map(a => {
                                  const dateStr = new Date(a.date).toLocaleDateString();
                                  const label = `${a.name} (${dateStr})`;
                                  return (
                                    <option key={a.id} value={a.id} title={label}>
                                      {label.length > 35 ? label.substring(0, 32) + '...' : label}
                                    </option>
                                  );
                                })
                              }
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button 
                            onClick={applyMarksheetFilters}
                            className="w-full bg-indigo-600 text-white hover:bg-indigo-700 font-bold py-2 px-4 rounded-xl text-xs transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2 whitespace-nowrap"
                          >
                            <Filter className="w-3.5 h-3.5" />
                            Apply Filters
                          </button>
                        </div>

                        <div className="flex items-center justify-end">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right leading-tight">
                            {filteredPerformances.length} Students<br/>
                            {performanceTabAssessments.length} Assessments
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto border rounded-xl">
                      <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th 
                              className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest sticky left-0 bg-slate-50 z-20 border-r border-slate-200 min-w-[150px] cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={() => setMarksheetSort(prev => ({ key: 'name', direction: prev.key === 'name' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                            >
                              <div className="flex items-center gap-1">
                                Student Name
                                {(yearFilter === '12 IB' || yearFilter === '13 IB' || yearFilter === 'IB_ALL') && marksheetSort.key === 'level' && <span className="text-[8px] bg-indigo-100 text-indigo-600 px-1 rounded ml-1">HL/SL</span>}
                                {marksheetSort.key === 'name' && (marksheetSort.direction === 'asc' ? '↑' : '↓')}
                              </div>
                            </th>
                            <th 
                              className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center border-r border-slate-200"
                            >
                              Baseline
                            </th>
                            <th 
                              className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center border-r border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={() => setMarksheetSort(prev => ({ key: 'avg', direction: prev.key === 'avg' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
                            >
                              <div className="flex items-center justify-center gap-1">
                                Avg %
                                {marksheetSort.key === 'avg' && (marksheetSort.direction === 'asc' ? '↑' : '↓')}
                              </div>
                            </th>
                            <th 
                              className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center border-r border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={() => setMarksheetSort(prev => ({ key: 'grade', direction: prev.key === 'grade' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
                            >
                              <div className="flex items-center justify-center gap-1">
                                Avg Grade
                                {marksheetSort.key === 'grade' && (marksheetSort.direction === 'asc' ? '↑' : '↓')}
                              </div>
                            </th>
                            <th 
                              className="py-3 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center border-r border-slate-200 min-w-[60px] cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={() => setMarksheetSort(prev => ({ key: 'gp', direction: prev.key === 'gp' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
                            >
                              <div className="flex items-center justify-center gap-1">
                                Avg GP
                                {marksheetSort.key === 'gp' && (marksheetSort.direction === 'asc' ? '↑' : '↓')}
                              </div>
                            </th>
                            {performanceTabAssessments.map(a => (
                              <th key={a.id} className="py-3 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center min-w-[120px] max-w-[120px] border-r border-slate-200 last:border-r-0 overflow-hidden">
                                <div className="flex flex-col items-center">
                                  <span className="truncate max-w-[110px]" title={a.name}>{a.name}</span>
                                  <span className="text-[8px] text-indigo-500 font-bold">max: {a.maxMarks}</span>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedMarksheetPerformances.length > 0 ? sortedMarksheetPerformances.map(p => {
                            return (
                              <tr key={p.student.id} className={`${p.student.isNew ? 'bg-amber-50/50' : ''} ${p.isConcern ? 'bg-rose-50/70' : ''} hover:bg-indigo-50/30 transition-colors group`}>
                                <td className={`py-2.5 px-4 sticky left-0 ${p.student.isNew ? 'bg-amber-50/90' : p.isConcern ? 'bg-rose-50/90' : 'bg-white'} group-hover:bg-indigo-50/30 z-10 border-r border-slate-200 shadow-[1px_0_3px_rgba(0,0,0,0.05)]`}>
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                      p.isConcern ? 'bg-rose-600 animate-pulse' :
                                      p.status === 'excellent' ? 'bg-emerald-500' : 
                                      p.status === 'on-track' ? 'bg-indigo-400' : 
                                      p.status === 'needs-improvement' ? 'bg-rose-400' :
                                      'bg-slate-300'
                                    }`}></div>
                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-bold text-slate-900 truncate">{p.student.name}</span>
                                        {p.isConcern && (
                                          <AlertCircle className="w-3 h-3 text-rose-500" />
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] font-bold text-indigo-500">{p.student.baselineGrade ? `Baseline ${p.student.baselineGrade}` : 'No Baseline'}</span>
                                        <span className="text-[9px] text-slate-300">|</span>
                                        <span className="text-[9px] text-slate-400 truncate">{p.student.groupName}</span>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2.5 px-2 text-center border-r border-slate-200 bg-slate-50/20 font-black text-indigo-600 text-xs">
                                  {p.student.baselineGrade || '—'}
                                </td>
                                <td className="py-2.5 px-2 text-center border-r border-slate-200">
                                  {p.hasData ? (
                                    <span className={`text-xs font-bold leading-none py-1 px-2 rounded-lg ${
                                      p.averagePercentage >= 80 ? 'bg-emerald-50 text-emerald-700' : 
                                      p.averagePercentage >= 50 ? 'bg-indigo-50 text-indigo-700' : 
                                      'bg-rose-50 text-rose-700'
                                    }`}>
                                      {p.averagePercentage.toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span className="text-[10px] italic text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-center border-r border-slate-200">
                                  {p.hasData ? (
                                    <span className={`text-xs font-black px-2 py-1 rounded-lg ${
                                      p.status === 'excellent' ? 'bg-emerald-100 text-emerald-700' :
                                      p.status === 'needs-improvement' ? 'bg-rose-100 text-rose-700' :
                                      'bg-indigo-100 text-indigo-700'
                                    }`}>
                                      {getGrade(p.averagePercentage, getStudentBoundaries(p.student))}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] italic text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-center border-r border-slate-200">
                                  {p.hasData ? (
                                    <span className="text-xs font-bold text-slate-600">
                                      {p.averagePoints.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] italic text-slate-300">—</span>
                                  )}
                                </td>
                                {performanceTabAssessments.map(a => {
                                  const mark = p.marks.find(m => m.assessmentId === a.id);
                                  const isAbsent = mark ? (mark as any).absent : false;
                                  
                                  if (marksheetEditMode) {
                                    return (
                                      <td key={a.id} className="py-2 px-1 text-center border-r border-slate-100 last:border-r-0">
                                        <div className="flex flex-col items-center gap-1">
                                          <input 
                                            type="number"
                                            className={`w-12 h-7 px-1 text-center text-xs font-bold border rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 transition-all ${
                                              isAbsent ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-slate-200 text-slate-900'
                                            }`}
                                            placeholder="—"
                                            value={mark?.score ?? ''}
                                            onChange={(e) => handleUpdateMark(p.student.id, a.id, e.target.value === '' ? null : parseFloat(e.target.value))}
                                          />
                                          <button 
                                            onClick={() => handleMarkAbsent(p.student.id, a.id, !isAbsent)}
                                            className={`text-[8px] font-bold uppercase px-1 rounded transition-all ${
                                              isAbsent ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                            }`}
                                          >
                                            Abs
                                          </button>
                                        </div>
                                      </td>
                                    );
                                  }

                                  if (!mark) {
                                    return (
                                      <td key={a.id} className="py-2.5 px-2 text-center border-r border-slate-100 last:border-r-0 italic text-slate-300 text-[10px]">
                                        —
                                      </td>
                                    );
                                  }
                                  
                                  const isAbsentMark = (mark as any).absent;
                                  
                                  const getMarkPerc = (m: Mark) => {
                                    const perc = (m.score / a.maxMarks) * 100;
                                    if (m.resitScore !== undefined && m.resitScore !== null) {
                                      const rp = (m.resitScore / (m.resitMaxMarks || a.maxMarks)) * 100;
                                      return (perc + rp) / 2;
                                    }
                                    return perc;
                                  };

                                  const percentage = getMarkPerc(mark);
                                  const grade = getGrade(percentage, getStudentBoundaries(p.student, a));
                                  const points = gradeToPoints(grade);
                                  
                                  return (
                                    <td key={a.id} className="py-2.5 px-2 text-center border-r border-slate-100 last:border-r-0">
                                      {isAbsentMark ? (
                                        <span className="text-[9px] font-bold text-rose-500 px-1.5 py-0.5 bg-rose-50 rounded">ABS</span>
                                      ) : (
                                        <div className="flex flex-col">
                                          <div className="flex items-center justify-center gap-1">
                                            <span className="text-xs font-bold text-slate-800">{mark.score}</span>
                                            {mark.resitScore !== undefined && mark.resitScore !== null && (
                                              <span className="text-[10px] text-indigo-500 font-bold" title={`Resit: ${mark.resitScore}/${mark.resitMaxMarks || a.maxMarks}`}>®</span>
                                            )}
                                          </div>
                                          <div className="flex flex-col leading-tight">
                                            <span className={`text-[9px] font-medium ${
                                              percentage >= 80 ? 'text-emerald-500' : 
                                              percentage >= 40 ? 'text-slate-400' : 
                                              'text-rose-500'
                                            }`}>{percentage.toFixed(0)}%</span>
                                            <div className="flex items-center justify-center gap-1 mt-0.5">
                                              <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 px-1 rounded">{grade}</span>
                                              <span className="text-[8px] font-bold text-slate-500">[{points}]</span>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          }) : (
                            <tr>
                              <td colSpan={performanceTabAssessments.length + 4} className="py-12 text-center bg-white">
                                <p className="text-sm text-slate-400 italic">No students found matching current filters.</p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'students' && (
            <motion.div 
              key="students"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Student List */}
              <div className="lg:col-span-1 space-y-4">
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => {
                      const defaultYear = (yearFilter !== 'all' && yearFilter !== 'IGCSE_ALL' && yearFilter !== 'IB_ALL') ? yearFilter : newStudent.yearGroup;
                      const firstGroup = groups.find(g => g.yearGroup === defaultYear)?.name || '';
                      setNewStudent(prev => ({ 
                        ...prev, 
                        yearGroup: defaultYear, 
                        groupName: prev.groupName || firstGroup 
                      }));
                      setShowStudentModal(true);
                    }}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Student
                  </button>
                  <button 
                    onClick={() => {
                      const fileInput = document.getElementById('student-file-upload');
                      if (fileInput) fileInput.click();
                    }}
                    className="btn-secondary w-full flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Bulk Upload Students
                    <input id="student-file-upload" type="file" accept=".csv,.xlsx,.xls" multiple onChange={handleFileUpload} className="hidden" />
                  </button>
                  <button 
                    onClick={downloadStudentTemplate}
                    className="btn-secondary w-full flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Student Template
                  </button>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search students..." 
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {(yearFilter === '12 IB' || yearFilter === '13 IB' || yearFilter === 'IB_ALL') && (
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                      {(['all', 'HL', 'SL'] as const).map(level => (
                        <button
                          key={level}
                          onClick={() => setIbLevelFilter(level)}
                          className={`flex-1 py-1 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                            ibLevelFilter === level 
                              ? 'bg-white text-indigo-600 shadow-sm' 
                              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Student List</span>
                    <button 
                      onClick={() => setExpandedSections(new Set())}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      Collapse All
                    </button>
                  </div>
                </div>

                <div className="card max-h-[calc(100vh-250px)] overflow-y-auto divide-y divide-slate-100">
                  {filteredPerformances.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-xs text-slate-400 italic">No students found</p>
                    </div>
                  ) : (
                    ([7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'] as YearGroup[])
                      .filter(y => matchesYearFilter(y, yearFilter))
                      .map(year => {
                        const yearStudents = filteredPerformances.filter(p => normYear(p.student.yearGroup) === normYear(year));
                        // Only show groups that have actual students (prevents ghost/deleted groups)
                        // Include empty groupName to show unassigned students
                        const yearGroups = Array.from(new Set(yearStudents.map(p => p.student.groupName || ''))).sort((a: string, b: string) => {
                          if (a === '') return -1;
                          if (b === '') return 1;
                          return a.localeCompare(b);
                        });
                        
                        if (yearStudents.length === 0) return null;
                        
                        const yearSectionId = `year-${year}`;
                        const isYearExpanded = expandedSections.has(yearSectionId);
                        
                        return (
                          <div key={year} className="bg-white">
                            <div 
                              onClick={() => toggleSection(yearSectionId)}
                              className="px-4 py-2 bg-slate-50 border-y border-slate-100 flex items-center justify-between group/year cursor-pointer hover:bg-slate-100 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {isYearExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{year === 'Graduated' ? 'Alumni / Graduated' : (typeof year === 'number' ? `Year ${year}` : year)}</h4>
                              </div>
                              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <select 
                                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-tight outline-none cursor-pointer hover:border-rose-300 hover:text-rose-600 transition-all shadow-sm"
                                  defaultValue=""
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val) {
                                      handleDeleteClass(year, val);
                                      e.target.value = ''; // Reset after delete
                                    }
                                  }}
                                >
                                  <option value="" disabled>Bulk Delete Class</option>
                                  {yearGroups.map(g => (
                                    <option key={g} value={g}>Delete Group {g}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            {isYearExpanded && (
                              (year === '12 IB' || year === '13 IB') ? (
                                ['HL', 'SL'].map(level => {
                                  const levelStudentsFromYear = yearStudents.filter(p => p.student.ibLevel === level);
                                  // Include empty groupName to show unassigned students
                                  const levelGroups = Array.from(new Set(levelStudentsFromYear.map(p => p.student.groupName || ''))).sort((a: string, b: string) => {
                                    if (a === '') return -1;
                                    if (b === '') return 1;
                                    return a.localeCompare(b);
                                  });
                                  
                                  if (levelStudentsFromYear.length === 0) return null;

                                  return (
                                    <div key={level} className="border-l-2 border-indigo-100 ml-2">
                                      <div className="px-4 py-1 bg-indigo-50/50 flex items-center justify-between">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-indigo-500">{level} Level Classes</span>
                                        <span className="text-[7px] font-bold text-indigo-300">{levelStudentsFromYear.length} students</span>
                                      </div>
                                      {levelGroups.map(groupName => {
                                        const groupPerformance = levelStudentsFromYear
                                          .filter(p => (p.student.groupName || '') === groupName)
                                          .sort((a, b) => a.student.name.localeCompare(b.student.name));
                                        
                                        const groupSectionId = `group-${year}-${level}-${groupName || 'unassigned'}`;
                                        const isGroupExpanded = expandedSections.has(groupSectionId);

                                        return (
                                          <div key={groupName || 'unassigned'} className="border-b border-slate-50 last:border-0 text-left">
                                            <div 
                                              onClick={() => toggleSection(groupSectionId)}
                                              className="px-4 py-1.5 bg-white flex items-center justify-between group/header cursor-pointer hover:bg-indigo-50/20 transition-colors"
                                            >
                                              <div className="flex items-center gap-2">
                                                {isGroupExpanded ? <ChevronDown className="w-2.5 h-2.5 text-indigo-300" /> : <ChevronRight className="w-2.5 h-2.5 text-indigo-300" />}
                                                <h5 className="text-[9px] font-bold uppercase tracking-tighter text-indigo-400">Class {groupName || 'Unassigned'}</h5>
                                              </div>
                                              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <button 
                                                  onClick={() => handleDeleteClass(year as YearGroup, groupName as string)}
                                                  className="opacity-0 group-hover/header:opacity-100 flex items-center gap-1 text-[8px] font-bold text-rose-500 hover:text-rose-600 transition-all"
                                                >
                                                  <Trash2 className="w-2.5 h-2.5" />
                                                  Delete
                                                </button>
                                              </div>
                                            </div>
                                            {isGroupExpanded && groupPerformance.map((p, idx) => (
                                              <div
                                                key={`${p.student.id}-${idx}`}
                                                onClick={() => setSelectedStudentId(p.student.id)}
                                                className={`w-full cursor-pointer px-3 py-1.5 transition-colors flex items-center justify-between group/student ${
                                                  selectedStudentId === p.student.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                                                }`}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter' || e.key === ' ') {
                                                    setSelectedStudentId(p.student.id);
                                                  }
                                                }}
                                              >
                                                <div className="flex items-center gap-2">
                                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] flex-shrink-0 ${
                                                    selectedStudentId === p.student.id ? 'bg-indigo-600 text-white' : 
                                                    (p as any).isConcern ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600'
                                                  }`}>
                                                    {(p.student.preferredName || p.student.name).split(' ').map((n: string) => n[0]).join('')}
                                                  </div>
                                                  <div className="min-w-0">
                                                    <p className={`font-bold text-[11px] truncate max-w-[100px] ${
                                                      (p as any).isConcern ? 'text-rose-600' : 'text-slate-900'
                                                    }`}>
                                                      {p.student.preferredName || p.student.name}
                                                      {p.student.isNew && <span className="ml-1 text-[7px] text-amber-500 uppercase font-black">New</span>}
                                                      {(p as any).isConcern && <span className="ml-1 text-[7px] text-rose-500 uppercase font-black">!</span>}
                                                    </p>
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                  <div className="flex flex-col items-end">
                                                    <span className={`text-[8px] font-bold px-1 rounded-sm border ${getStatusColor(p.status)}`}>
                                                      {(p as any).hasData ? `${p.averagePercentage.toFixed(0)}%` : '—'}
                                                    </span>
                                                    {(p as any).hasData && (
                                                      <span className="text-[9px] font-black text-slate-700 mt-0.5">
                                                        {getGrade(p.averagePercentage, getStudentBoundaries(p.student))}
                                                      </span>
                                                    )}
                                                  </div>
                                                    <button 
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteStudent(p.student.id);
                                                      }}
                                                      className={`p-0.5 text-rose-500 transition-all ${selectedStudentId === p.student.id ? 'opacity-100' : 'opacity-40 group-hover/student:opacity-70 hover:!opacity-100'}`}
                                                      title="Delete student"
                                                    >
                                                      <Trash2 className="w-2.5 h-2.5" />
                                                    </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })
                              ) : (
                                yearGroups.map(groupName => {
                                  const groupStudents = yearStudents
                                    .filter(p => (p.student.groupName || '') === groupName)
                                    .sort((a, b) => a.student.name.localeCompare(b.student.name));
                                  const groupSectionId = `group-${year}-${groupName || 'unassigned'}`;
                                  const isGroupExpanded = expandedSections.has(groupSectionId);

                                  return (
                                    <div key={groupName || 'unassigned'}>
                                      <div 
                                        onClick={() => toggleSection(groupSectionId)}
                                        className="px-4 py-1.5 bg-white flex items-center justify-between group/header cursor-pointer hover:bg-slate-50 transition-colors"
                                      >
                                        <div className="flex items-center gap-2">
                                          {isGroupExpanded ? <ChevronDown className="w-2.5 h-2.5 text-indigo-300" /> : <ChevronRight className="w-2.5 h-2.5 text-indigo-300" />}
                                          <h5 className="text-[9px] font-bold uppercase tracking-tighter text-indigo-400">Class {groupName || 'Unassigned'}</h5>
                                        </div>
                                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                          {groupStudents.length > 0 && (
                                            <button 
                                              onClick={() => handleDeleteClass(year as YearGroup, groupName as string)}
                                              className="opacity-0 group-hover/header:opacity-100 flex items-center gap-1 text-[8px] font-bold text-rose-500 hover:text-rose-600 transition-all"
                                              title="Delete all students in this class"
                                            >
                                              <Trash2 className="w-2.5 h-2.5" />
                                              Delete
                                            </button>
                                          )}
                                          {groupStudents.length === 0 && (
                                            <span className="text-[8px] text-slate-300 italic">Empty</span>
                                          )}
                                        </div>
                                      </div>
                                      {isGroupExpanded && groupStudents.map((p, idx) => (
                                        <div
                                          key={`${p.student.id}-${idx}`}
                                          onClick={() => setSelectedStudentId(p.student.id)}
                                          className={`w-full cursor-pointer text-left px-3 py-1.5 transition-colors flex items-center justify-between group/student ${
                                            selectedStudentId === p.student.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                                          }`}
                                          role="button"
                                          tabIndex={0}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              setSelectedStudentId(p.student.id);
                                            }
                                          }}
                                        >
                                          <div className="flex items-center gap-2">
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] flex-shrink-0 ${
                                              selectedStudentId === p.student.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                              {(p.student.preferredName || p.student.name).split(' ').map((n: string) => n[0]).join('')}
                                            </div>
                                            <div className="min-w-0">
                                              <p className="font-bold text-slate-900 text-[11px] truncate max-w-[100px]">
                                                {p.student.preferredName || p.student.name}
                                                {p.student.isNew && <span className="ml-1 text-[7px] text-amber-500 uppercase">New</span>}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <span className={`text-[8px] px-1 py-0.5 rounded-full border font-bold ${getStatusColor(p.status)}`}>
                                              {(p as any).hasData ? `${p.averagePercentage.toFixed(0)}%` : '—'}
                                            </span>
                                            {getTrendIcon(p.trend)}
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteStudent(p.student.id);
                                              }}
                                              className={`p-1 hover:bg-rose-100 rounded text-rose-500 transition-all ${selectedStudentId === p.student.id ? 'opacity-100' : 'opacity-40 group-hover/student:opacity-70 hover:!opacity-100'}`}
                                              title="Delete student"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })
                              )
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Student Detail */}
              <div className="lg:col-span-2">
                {selectedStudentId ? (
                  <div className="space-y-6">
                    {performances.filter(p => p.student.id === selectedStudentId).map((p, idx) => (
                      <div key={`${p.student.id}-${idx}`} className="space-y-6">
                        <div className="card p-6">
                          <div className="flex items-center justify-between mb-8">
                            <div>
                              <h2 className="text-2xl font-bold text-slate-900">
                                {p.student.preferredName || p.student.name}
                                {p.student.ibLevel && (
                                  <span className={`ml-3 px-2 py-0.5 rounded-lg text-sm font-bold align-middle ${
                                    p.student.ibLevel === 'HL' ? 'bg-violet-100 text-violet-600 border border-violet-200' : 'bg-sky-100 text-sky-600 border border-sky-200'
                                  }`}>
                                    {p.student.ibLevel} Level
                                  </span>
                                )}
                                {p.student.isNew && (
                                  <span className="ml-3 px-2 py-0.5 rounded-lg text-sm font-bold align-middle bg-amber-100 text-amber-700 border border-amber-200">
                                    New Admission
                                  </span>
                                )}
                                {p.student.preferredName && p.student.preferredName !== p.student.name && (
                                  <span className="ml-3 text-lg text-slate-400 font-medium">({p.student.name})</span>
                                )}
                              </h2>
                              <div className="flex items-center gap-2 mt-1">
                                <button 
                                  onClick={() => {
                                    setEditingStudentId(p.student.id);
                                    setNewStudent({
                                      name: p.student.name,
                                      preferredName: p.student.preferredName || '',
                                      yearGroup: p.student.yearGroup,
                                      groupName: p.student.groupName,
                                      ibLevel: p.student.ibLevel,
                                      isNew: !!p.student.isNew,
                                      notes: p.student.notes || '',
                                      baselineGrade: p.student.baselineGrade || '',
                                      ...((p.student as any).subjects && { subjects: (p.student as any).subjects }),
                                      ...((p.student as any).subjectLevels && { subjectLevels: (p.student as any).subjectLevels })
                                    } as any);
                                    setShowStudentModal(true);
                                  }}
                                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Edit Details
                                </button>
                                <div className="w-px h-3 bg-slate-200 mx-1" />
                                <button 
                                  onClick={() => handleDeleteStudent(p.student.id)}
                                  className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete Student
                                </button>
                              </div>
                              <p className="text-slate-500 mt-2">
                                {formatYearGroup(p.student.yearGroup)} • {p.student.groupName} • {' '}
                                {(p as any).hasData 
                                  ? (
                                    <>
                                      Overall Average: <span className="font-bold text-slate-700">{p.averagePercentage.toFixed(1)}%</span>
                                      <span className="ml-2 text-[10px] text-slate-400 font-medium bg-slate-100 px-1.5 py-0.5 rounded" title="Averages exclude any assessments marked as Absent">
                                        Excl. Absences
                                      </span>
                                    </>
                                  )
                                  : <span className="text-slate-400 italic">No assessments sat yet</span>
                                }
                                {(p as any).absentCount > 0 && (
                                  <span className="ml-2 text-[11px] text-rose-400">• {(p as any).absentCount} absent</span>
                                )}
                              </p>
                              {/* HL/SL subject level badges for IB students */}
                              {(p.student as any).subjectLevels && Object.keys((p.student as any).subjectLevels).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {Object.entries((p.student as any).subjectLevels as Record<string, string>).map(([subject, level]) => (
                                    <span 
                                      key={subject}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                        level === 'HL' 
                                          ? 'bg-violet-50 text-violet-700 border-violet-200' 
                                          : 'bg-sky-50 text-sky-700 border-sky-200'
                                      }`}
                                    >
                                      <span style={{ color: SUBJECT_COLORS[subject] || '#6366f1' }}>●</span>
                                      {subject} <span className="opacity-75">{level}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                <Target className="w-3 h-3 text-indigo-500" />
                                Baseline
                              </p>
                              <p className="text-2xl font-black text-slate-900 leading-none">{p.student.baselineGrade || 'Not set'}</p>
                              <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">Initial Target</p>
                            </div>
                            
                            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl">
                              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                <TrendingUp className="w-3 h-3" />
                                Current Avg
                              </p>
                              <div className="flex items-baseline gap-1.5">
                                <p className="text-2xl font-black text-indigo-700 leading-none">
                                  {p.averagePercentage.toFixed(0)}%
                                </p>
                                <p className="text-sm font-black text-indigo-500 leading-none">{getGrade(p.averagePercentage, getStudentBoundaries(p.student))}</p>
                              </div>
                              <p className="text-[9px] text-indigo-400 font-bold mt-1 uppercase tracking-tighter">Running Average</p>
                            </div>

                            <div className={`p-4 rounded-2xl border ${p.isConcern ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
                              <p className={`text-[10px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5 ${p.isConcern ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {p.isConcern ? <AlertCircle className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                                Status
                              </p>
                              <p className={`text-sm font-black uppercase tracking-tight leading-none ${p.isConcern ? 'text-rose-600 font-black' : 'text-emerald-600'}`}>
                                {p.isConcern ? 'Critical Alert' : p.status.replace('-', ' ')}
                              </p>
                              <p className={`text-[9px] font-bold mt-1 uppercase tracking-tighter ${p.isConcern ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {p.isConcern ? 'Significant drop detected' : 'Within expectations'}
                              </p>
                            </div>

                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                <History className="w-3 h-3" />
                                Growth
                              </p>
                              <div className="flex items-center gap-2">
                                {getTrendIcon(p.trend)}
                                <p className="text-sm font-black text-slate-700 capitalize leading-none">{p.trend}</p>
                              </div>
                              <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">Recent Momentum</p>
                            </div>
                          </div>

                          {p.student.notes && (
                            <div className={`mb-6 p-4 rounded-xl border ${p.student.isNew ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                              <h4 className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${p.student.isNew ? 'text-amber-700' : 'text-slate-500'}`}>
                                <FileText className="w-3 h-3" />
                                Teacher Notes
                              </h4>
                              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap italic">
                                "{p.student.notes}"
                              </p>
                            </div>
                          )}

                          <div className="h-[250px] mb-8">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={(performanceSubjectFilter === 'all' ? p.marks : p.marks.filter(m => m.assessment.subject === performanceSubjectFilter)).map(m => {
                                const basePerc = (m.score / m.assessment.maxMarks) * 100;
                                const resitPerc = (m.resitScore !== undefined && m.resitScore !== null) ? (m.resitScore / (m.resitMaxMarks || m.assessment.maxMarks) * 100) : null;
                                const finalPerc = resitPerc !== null ? (basePerc + resitPerc) / 2 : basePerc;
                                return {
                                  name: m.assessment.name,
                                  score: finalPerc
                                };
                              })}>
                                <defs>
                                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} />
                                <Tooltip 
                                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Area type="monotone" dataKey="score" stroke="#4f46e5" fillOpacity={1} fill="url(#colorScore)" strokeWidth={2} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-100">
                                  <th className="pb-3 px-2">Assessment</th>
                                  <th className="pb-3 px-2">Subject</th>
                                  <th className="pb-3 px-2">Date</th>
                                  <th className="pb-3 px-2">Score</th>
                                  <th className="pb-3 px-2 text-right">Grade</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {(performanceSubjectFilter === 'all' ? p.marks : p.marks.filter(m => m.assessment.subject === performanceSubjectFilter)).map((m, idx) => {
                                  const basePerc = (m.score / m.assessment.maxMarks) * 100;
                                  const resitPerc = (m.resitScore !== undefined && m.resitScore !== null) ? (m.resitScore / (m.resitMaxMarks || m.assessment.maxMarks) * 100) : null;
                                  const percentage = resitPerc !== null ? (basePerc + resitPerc) / 2 : basePerc;
                                  
                                  const currentBoundaries = getStudentBoundaries(p.student, m.assessment);
                                  const grade = getGrade(percentage, currentBoundaries);
                                  
                                  return (
                                    <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                                      <td className="py-3 px-2 font-medium text-slate-900">
                                        {m.assessment.name}
                                        {resitPerc !== null && (
                                          <div className="text-[8px] text-indigo-500 font-bold uppercase mt-0.5">Resit Taken</div>
                                        )}
                                      </td>
                                      <td className="py-3 px-2 text-slate-600">{m.assessment.subject}</td>
                                      <td className="py-3 px-2 text-slate-500">{m.assessment.date}</td>
                                      <td className="py-3 px-2 text-slate-900 font-mono">
                                        {resitPerc !== null ? (
                                          <div className="flex flex-col">
                                            <span>{m.score}/{m.assessment.maxMarks}</span>
                                            <span className="text-[10px] text-slate-400 italic">Resit: {m.resitScore}/{m.resitMaxMarks || m.assessment.maxMarks}</span>
                                          </div>
                                        ) : (
                                          `${m.score}/${m.assessment.maxMarks}`
                                        )}
                                      </td>
                                      <td className="py-3 px-2 text-right">
                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-xs ${
                                          percentage >= 80 ? 'bg-emerald-100 text-emerald-700' : 
                                          percentage < 50 ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                                        }`}>
                                          {grade}
                                        </span>
                                        <span className="ml-2 text-[10px] text-slate-400 font-medium">{percentage.toFixed(0)}%</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="card h-full flex flex-col items-center justify-center p-12 text-center text-slate-400">
                    <Users className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium">Select a student to view detailed performance</p>
                    <p className="text-sm">You can search or filter students using the sidebar</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'assessments' && (
            <motion.div 
              key="assessments"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Assessments & Marks</h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject</span>
                    <select 
                      className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer min-w-[120px]"
                      value={performanceSubjectFilter}
                      onChange={(e) => setPerformanceSubjectFilter(e.target.value)}
                    >
                      <option value="all">All Subjects</option>
                      {availablePerformanceSubjects.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    onClick={() => {
                      const fileInput = document.getElementById('assessment-file-upload');
                      if (fileInput) fileInput.click();
                    }}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Marks
                    <input id="assessment-file-upload" type="file" accept=".csv,.xlsx,.xls" multiple onChange={handleFileUpload} className="hidden" />
                  </button>
                  <button 
                    onClick={() => {
                      const defaultYear = (yearFilter !== 'all' && yearFilter !== 'IGCSE_ALL' && yearFilter !== 'IB_ALL') ? yearFilter : newAssessment.yearGroup;
                      setNewAssessment(prev => ({ 
                        ...prev, 
                        yearGroup: defaultYear,
                        subject: prev.yearGroup === defaultYear ? prev.subject : SUBJECTS_BY_YEAR[defaultYear][0]
                      }));
                      setShowAssessmentModal(true);
                    }}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    New Assessment
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pb-2">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'IGCSE_ALL', label: 'IGCSE' },
                    { id: 'IB_ALL', label: 'IB' },
                    { id: 7, label: 'Y7' },
                    { id: 8, label: 'Y8' },
                    { id: 9, label: 'Y9' },
                    { id: '10 IGCSE', label: 'Y10' },
                    { id: '11 IGCSE', label: 'Y11' },
                    { id: '12 IB', label: 'Y12' },
                    { id: '13 IB', label: 'Y13' },
                    { id: 'Graduated', label: 'Graduated' },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => {
                        if (filter.id === 'all') setYearFilter('all');
                        else if (filter.id === 'IGCSE_ALL') setYearFilter('IGCSE_ALL');
                        else if (filter.id === 'IB_ALL') setYearFilter('IB_ALL');
                        else setYearFilter(filter.id as YearGroup);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        yearFilter === filter.id 
                          ? 'bg-white text-indigo-600 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(() => {
                  const filteredAssessments = assessments.filter(a => 
                    a.academicYear === selectedAcademicYear && 
                    matchesYearFilter(a.yearGroup, yearFilter) && 
                    (performanceSubjectFilter === 'all' || a.subject === performanceSubjectFilter) && 
                    (ibLevelFilter === 'all' || !a.ibLevel || a.ibLevel === 'Both' || a.ibLevel === ibLevelFilter)
                  );

                  // De-duplicate assessments to prevent sync-duplicates from cluttering UI
                  const uniqueAssessments: Assessment[] = [];
                  const seenKeys = new Set<string>();
                  
                  // Sort by date descending first so we keep the most recent one if duplicates exist
                  const sortedFiltered = [...filteredAssessments].sort((a, b) => 
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                  );

                  for (const a of sortedFiltered) {
                    const key = `${a.name.trim().toLowerCase()}|${a.subject}|${normYear(a.yearGroup)}|${a.academicYear}|${a.ibLevel || 'Both'}`;
                    if (!seenKeys.has(key)) {
                      uniqueAssessments.push(a);
                      seenKeys.add(key);
                    }
                  }

                  return uniqueAssessments.map(assessment => (
                  <div key={assessment.id} className="card p-6 hover:border-indigo-200 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span 
                          className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-2 inline-block"
                          style={{ 
                            backgroundColor: `${SUBJECT_COLORS[assessment.subject] || '#6366f1'}15`,
                            color: SUBJECT_COLORS[assessment.subject] || '#6366f1'
                          }}
                        >
                          {assessment.subject}
                        </span>
                        <h3 className="text-lg font-bold text-slate-900">{assessment.name}</h3>
                        <p className="text-sm text-slate-500">
                          {formatYearGroup(assessment.yearGroup)} • {assessment.date}
                          {assessment.ibLevel && (
                             <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                               assessment.ibLevel === 'HL' ? 'bg-violet-100 text-violet-600' : 'bg-sky-100 text-sky-600'
                             }`}>
                               {assessment.ibLevel}
                             </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => {
                            setEditingAssessmentId(assessment.id);
                            setNewAssessment({
                              name: assessment.name,
                              subject: assessment.subject,
                              maxMarks: assessment.maxMarks,
                              date: assessment.date,
                              yearGroup: assessment.yearGroup,
                              ibLevel: assessment.ibLevel || 'Both'
                            });
                            setShowAssessmentModal(true);
                          }}
                          className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Edit Assessment"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteAssessment(assessment.id)}
                          className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                          title="Delete Assessment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {(() => {
                      const unfilteredStudents = students.filter(s => {
                        const yearMatch = normYear(s.yearGroup) === normYear(assessment.yearGroup) && s.academicYear === assessment.academicYear;
                        if (!yearMatch) return false;
                        
                        // If assessment has specific level, filter students by that level
                        if (assessment.ibLevel && assessment.ibLevel !== 'Both') {
                          return (s.ibLevel === assessment.ibLevel);
                        }
                        return true;
                      });

                      // De-duplicate by name to handle 'replicating' data issues
                      // Prefer students that have a group name or have a mark for this assessment
                      const currentYearStudents: Student[] = [];
                      const seenNames = new Set<string>();
                      
                      const sortedUnfiltered = [...unfilteredStudents].sort((a, b) => {
                        const aHasMark = marks.some(m => m.studentId === a.id && m.assessmentId === assessment.id);
                        const bHasMark = marks.some(m => m.studentId === b.id && m.assessmentId === assessment.id);
                        if (aHasMark && !bHasMark) return -1;
                        if (!aHasMark && bHasMark) return 1;
                        if (a.groupName && !b.groupName) return -1;
                        if (!a.groupName && b.groupName) return 1;
                        return 0;
                      });

                      for (const s of sortedUnfiltered) {
                        const nameKey = s.name.trim().toLowerCase();
                        if (!seenNames.has(nameKey)) {
                          currentYearStudents.push(s);
                          seenNames.add(nameKey);
                        }
                      }

                      const totalStudents = currentYearStudents.length;
                      const studentIdsInYear = new Set(currentYearStudents.map(s => s.id));

                      const allAssessmentMarks = marks.filter(m => 
                        m.assessmentId === assessment.id && 
                        studentIdsInYear.has(m.studentId)
                      );
                      const absentMarks = allAssessmentMarks.filter(m => (m as any).absent);
                      
                      // Only count unique students who actually sat the exam (not absent) for avg and marked count
                      const assessmentMarks = allAssessmentMarks.filter(m => !(m as any).absent);
                      
                      // Use a Map to deduplicate marks by studentId
                      const uniqueMarksMap = new Map<string, Mark>();
                      assessmentMarks.forEach(m => {
                        if (!uniqueMarksMap.has(m.studentId)) {
                          uniqueMarksMap.set(m.studentId, m);
                        }
                      });
                      
                      const markedCount = uniqueMarksMap.size;
                      const avg = markedCount > 0
                        ? Array.from(uniqueMarksMap.values()).reduce((acc, m) => acc + getMarkPercentage(m, assessment), 0) / markedCount
                        : null;
                      
                      // unmarked = students in this year group with no mark record at all
                      const uniqueAllMarksStudents = new Set(allAssessmentMarks.map(m => m.studentId));
                      const unmarkedCount = Math.max(0, totalStudents - uniqueAllMarksStudents.size);
                      return (
                        <div className="mt-4 pt-4 border-t border-slate-50 space-y-3">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-slate-50 rounded-lg p-2">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Max Marks</p>
                              <p className="text-sm font-bold text-slate-900">{assessment.maxMarks}</p>
                            </div>
                            <div className={`rounded-lg p-2 ${avg !== null ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Class Avg</p>
                              <p className={`text-sm font-bold ${avg !== null ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {avg !== null ? `${avg.toFixed(1)}%` : '—'}
                              </p>
                            </div>
                            <div className={`rounded-lg p-2 ${unmarkedCount > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Marked</p>
                              <p className={`text-sm font-bold ${unmarkedCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {markedCount}/{totalStudents}
                              </p>
                              {absentMarks.length > 0 && (
                                <p className="text-[8px] text-rose-400 font-bold mt-0.5">{absentMarks.length} absent</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => setShowMarksModal(assessment.id)}
                              className="flex-1 text-indigo-600 text-sm font-bold flex items-center justify-center gap-1 hover:gap-2 transition-all"
                            >
                              Manage Marks <ChevronRight className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setShowPaperGradingModal(assessment.id)}
                              className="flex-1 text-emerald-600 text-sm font-bold flex items-center justify-center gap-1 hover:gap-2 transition-all"
                            >
                              Grade by Question <FileText className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))
              })()}
            </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto space-y-12"
            >
              {/* Data & Synchronization Section */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2 font-display">Data & Synchronization</h2>
                  <p className="text-slate-500 text-sm">Manage how your student data is stored. Access your data offline without signing in.</p>
                </div>
                
                <div className="grid gap-4">
                  <div className="card p-5 flex items-center justify-between gap-6 hover:border-indigo-200 transition-all">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600 border border-sky-100">
                        <Cloud className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-900">Cloud Sync (Firebase)</h4>
                        <p className="text-xs text-slate-500 leading-relaxed max-w-sm">Automatically sync your data to the cloud. Turn this off to keep all student records strictly in your browser's private storage.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setUseCloudSync(!useCloudSync)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${useCloudSync ? 'bg-indigo-600' : 'bg-slate-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useCloudSync ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button 
                      onClick={() => window.location.reload()}
                      className="card p-5 text-left hover:border-indigo-200 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100 group-hover:scale-110 transition-transform">
                          <History className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-slate-900 font-display">Recover Lost Data</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">Runs a deep scan of browser history to find and restore data for Years 7, 10, and 12.</p>
                    </button>

                    <button 
                      onClick={backupData}
                      className="card p-5 text-left hover:border-rose-200 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 border border-rose-100 group-hover:scale-110 transition-transform">
                          <Download className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-slate-900 font-display">Manual Backup</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">Save a physical offline backup of your tracker. Recommended before any major year transitions.</p>
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2 font-display">Manage Class Groups</h2>
                  <p className="text-slate-500 text-sm">View and manage your custom class groups. Deleting a group will not delete the students within it, but they will no longer be associated with that group name.</p>
                </div>

                <div className="grid gap-3">
                  {groups.length === 0 ? (
                    <div className="card p-8 text-center bg-slate-50/50 border-dashed">
                      <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-400 text-sm">No custom groups found.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groups
                        .filter(g => g.academicYear === selectedAcademicYear)
                        .filter(g => matchesYearFilter(g.yearGroup, yearFilter))
                        .sort((a, b) => {
                          const yearA = String(a.yearGroup);
                          const yearB = String(b.yearGroup);
                          if (yearA !== yearB) return yearA.localeCompare(yearB);
                          return a.name.localeCompare(b.name);
                        })
                        .map(group => {
                          const groupStudents = students.filter(s => s.groupName === group.name && s.academicYear === group.academicYear);
                          
                          // Calculate group average for the card
                          const groupStats = groupStudents.map(s => {
                            const studentMarks = marks.filter(m => m.studentId === s.id);
                            const percentages = studentMarks.map(m => {
                              const assessment = assessments.find(a => a.id === m.assessmentId);
                              if (!assessment) return null;
                              const score = Number(m.score) || 0;
                              const maxMarks = Number(assessment.maxMarks) || 100;
                              let p = (score / maxMarks) * 100;
                              if (m.resitScore !== undefined && m.resitScore !== null) {
                                const rScore = Number(m.resitScore);
                                const rMax = Number(m.resitMaxMarks || assessment.maxMarks || 100);
                                const rPerc = (rScore / rMax) * 100;
                                p = (p + rPerc) / 2;
                              }
                              return p;
                            }).filter((p): p is number => p !== null);
                            return percentages.length > 0 ? (percentages.reduce((a, b) => a + b, 0) / percentages.length) : null;
                          }).filter((p): p is number => p !== null);

                          const avgScore = groupStats.length > 0 ? (groupStats.reduce((a, b) => a + b, 0) / groupStats.length) : null;
                          const avgGrade = avgScore !== null ? getGrade(avgScore, getStudentBoundaries(groupStudents[0] || students[0])) : null;

                          return (
                            <div 
                              key={group.id} 
                              onClick={() => setSelectedGroupDetails(group)}
                              className="card p-4 flex items-center justify-between group/row hover:border-indigo-300 hover:bg-slate-50/50 transition-all cursor-pointer shadow-sm hover:shadow-md"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100 group-hover/row:bg-indigo-600 group-hover/row:text-white transition-all">
                                  <Users className="w-5 h-5" />
                                </div>
                                <div>
                                  <h4 className="font-bold text-slate-900 leading-none mb-1">{group.name}</h4>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                                      {group.academicYear}
                                    </span>
                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                      Year {group.yearGroup}
                                    </span>
                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                      {groupStudents.length} Students
                                    </span>
                                    {avgScore !== null && (
                                      <>
                                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                                          {avgScore.toFixed(1)}% Avg
                                        </span>
                                        <span className="text-[10px] font-black text-indigo-500 ml-1">
                                          ({avgGrade})
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteGroup(group.id);
                                  }}
                                  className={`p-2 rounded-lg transition-all ${
                                    groupStudents.length === 0 
                                      ? 'bg-rose-50 text-rose-600 border border-rose-100 opacity-100' 
                                      : 'text-slate-300 hover:text-rose-500 opacity-0 group-hover/row:opacity-100'
                                  }`}
                                  title="Delete Group"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover/row:text-indigo-400 group-hover/row:translate-x-0.5 transition-all" />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-slate-900 font-display">Grade Boundaries</h2>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          const isLocked = !!lockedYearBoundaries[selectedSettingScope];
                          setLockedYearBoundaries(prev => ({ ...prev, [selectedSettingScope]: !isLocked }));
                        }}
                        className={`p-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                          lockedYearBoundaries[selectedSettingScope] 
                            ? 'bg-amber-50 border-amber-200 text-amber-600' 
                            : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
                        }`}
                        title={lockedYearBoundaries[selectedSettingScope] ? "Unlock to edit" : "Lock boundaries"}
                      >
                        {lockedYearBoundaries[selectedSettingScope] ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        <span className="text-[10px] uppercase font-bold tracking-wider">
                          {lockedYearBoundaries[selectedSettingScope] ? "Locked" : "Unlocked"}
                        </span>
                      </button>
                      <button 
                        onClick={() => setShowBoundaryShare(selectedSettingScope)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100 flex items-center gap-1.5"
                        title="Generate shareable version"
                      >
                        <Plus className="w-4 h-4 rotate-45" />
                        <span className="text-[10px] uppercase font-bold tracking-wider">Share</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-slate-500 text-sm">Define the minimum percentage required for each grade level.</p>
                </div>
                <div className="flex items-center gap-3">
                  {!lockedYearBoundaries[selectedSettingScope] && (
                    <button 
                      onClick={() => {
                        const newBoundaries = [...(yearBoundaries[selectedSettingScope] || [])];
                        newBoundaries.push({ grade: 'New', minPercentage: 0 });
                        setYearBoundaries(prev => ({ ...prev, [selectedSettingScope]: newBoundaries }));
                      }}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Grade
                    </button>
                  )}
                  <select 
                    className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={selectedSettingScope}
                    onChange={(e) => setSelectedSettingScope(e.target.value)}
                  >
                    <optgroup label="Core Year Groups">
                      {[7, 8, 9, '10 IGCSE', '11 IGCSE'].map(y => (
                        <option key={y} value={y}>{typeof y === 'number' ? `Year ${y}` : y}</option>
                      ))}
                      <option value="12 IB">Year 12 IB (General)</option>
                      <option value="13 IB">Year 13 IB (General)</option>
                    </optgroup>
                    <optgroup label="IB Level-Specific Boundaries">
                      <option value="12 IB HL">Year 12 IB HL (Higher Level)</option>
                      <option value="12 IB SL">Year 12 IB SL (Standard Level)</option>
                      <option value="13 IB HL">Year 13 IB HL (Higher Level)</option>
                      <option value="13 IB SL">Year 13 IB SL (Standard Level)</option>
                    </optgroup>
                    <optgroup label="Special Groups">
                      <option value="Graduated">Graduated / Alumni</option>
                    </optgroup>
                    <optgroup label="Individual Classes">
                      {groups
                        .filter(g => g.academicYear === selectedAcademicYear)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(g => (
                          <option key={g.id} value={g.name}>{g.name} (Year {g.yearGroup})</option>
                        ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              <div className="card divide-y divide-slate-100">
                {(yearBoundaries[selectedSettingScope] || [])
                  .sort((a, b) => b.minPercentage - a.minPercentage)
                  .map((boundary, idx) => {
                    // Find original index for state updates
                    const originalIdx = (yearBoundaries[selectedSettingScope] || []).indexOf(boundary);
                    const isLocked = !!lockedYearBoundaries[selectedSettingScope];
                    return (
                      <div key={idx} className={`p-4 flex items-center justify-between gap-4 transition-all ${isLocked ? 'bg-slate-50/50 opacity-80' : ''}`}>
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex flex-col items-center">
                            <span className="text-[8px] text-slate-400 uppercase font-bold mb-1">Grade</span>
                            <input 
                              type="text"
                              disabled={isLocked}
                              className={`w-14 h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center font-bold text-indigo-600 text-center outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm ${isLocked ? 'cursor-not-allowed text-slate-400' : ''}`}
                              value={boundary.grade}
                              onChange={(e) => {
                                if (isLocked) return;
                                const newBoundaries = [...(yearBoundaries[selectedSettingScope] || [])];
                                newBoundaries[originalIdx].grade = e.target.value;
                                setYearBoundaries(prev => ({ ...prev, [selectedSettingScope]: newBoundaries }));
                              }}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span className={`text-[11px] font-medium ${isLocked ? 'text-slate-400' : 'text-slate-500'}`}>Minimum Percentage</span>
                              <div className="flex items-center gap-1">
                                <input 
                                  type="number"
                                  min="0"
                                  max="100"
                                  disabled={isLocked}
                                  value={boundary.minPercentage}
                                  onChange={(e) => {
                                    if (isLocked) return;
                                    const val = parseInt(e.target.value) || 0;
                                    const newBoundaries = [...(yearBoundaries[selectedSettingScope] || [])];
                                    newBoundaries[originalIdx].minPercentage = Math.min(100, Math.max(0, val));
                                    setYearBoundaries(prev => ({ ...prev, [selectedSettingScope]: newBoundaries }));
                                  }}
                                  className={`w-14 px-1.5 py-0.5 text-right font-bold text-slate-900 border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-indigo-500 text-sm ${isLocked ? 'cursor-not-allowed bg-slate-50 text-slate-400' : ''}`}
                                />
                                <span className={`font-bold text-xs ${isLocked ? 'text-slate-400' : 'text-slate-900'}`}>%</span>
                              </div>
                            </div>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              disabled={isLocked}
                              value={boundary.minPercentage}
                              onChange={(e) => {
                                if (isLocked) return;
                                const newBoundaries = [...(yearBoundaries[selectedSettingScope] || [])];
                                newBoundaries[originalIdx].minPercentage = parseInt(e.target.value);
                                setYearBoundaries(prev => ({ ...prev, [selectedSettingScope]: newBoundaries }));
                              }}
                              className={`w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600 ${isLocked ? 'cursor-not-allowed opacity-50' : ''}`}
                            />
                          </div>
                        </div>
                        {!isLocked && (
                          <button 
                            onClick={() => setYearBoundaries(prev => ({
                              ...prev,
                              [selectedSettingScope]: prev[selectedSettingScope].filter((_, i) => i !== originalIdx)
                            }))}
                            className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                <button 
                  onClick={() => handleAddGrade(false)}
                  className="w-full p-4 text-indigo-600 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Grade Level
                </button>
              </div>

              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => {
                    const newBoundaries = { ...yearBoundaries };
                    Object.keys(newBoundaries).forEach(y => {
                      if (typeof y === 'number' || !isNaN(parseInt(y as any))) newBoundaries[y] = [...KS3_BOUNDARIES];
                      else if (String(y).includes('IGCSE')) newBoundaries[y] = [...IGCSE_BOUNDARIES];
                      else if (String(y).includes('IB')) newBoundaries[y] = [...IB_BOUNDARIES];
                    });
                    setYearBoundaries(newBoundaries);
                  }}
                  className="btn-secondary text-rose-600 border-rose-100 hover:bg-rose-50"
                >
                  Reset All to Standards
                </button>
                <button 
                  onClick={() => {
                    let defaults = KS3_BOUNDARIES;
                    const scope = selectedSettingScope;
                    // Find which year group this scope belongs to
                    let yearGroup: any = scope;
                    const group = groups.find(g => g.name === scope);
                    if (group) yearGroup = group.yearGroup;

                    if (typeof yearGroup === 'string') {
                      if (yearGroup.includes('IGCSE')) defaults = IGCSE_BOUNDARIES;
                      else if (yearGroup.includes('IB')) defaults = IB_BOUNDARIES;
                    }
                    setYearBoundaries(prev => ({ ...prev, [scope]: [...defaults] }));
                  }}
                  className="btn-secondary"
                >
                  Reset Scope to Defaults
                </button>
                <button 
                  onClick={() => {
                    setSaveStatus('saving');
                    setTimeout(() => setSaveStatus('saved'), 600);
                    setTimeout(() => setSaveStatus('idle'), 3000);
                  }}
                  className="btn-primary min-w-[120px]"
                >
                  {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Changes'}
                </button>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <div className="card p-6 bg-indigo-50 border-indigo-100">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-indigo-900 mb-1">Current Year: {selectedAcademicYear}</p>
                      <p className="text-xs text-indigo-700">
                        Promoting will move students to their next year group (e.g. Year 10 → Year 11). 
                        For IGCSE and IB students, their prior year data will follow them to the new year view.
                      </p>
                    </div>
                    <button 
                      onClick={handleYearTransition}
                      className="btn-primary whitespace-nowrap flex items-center gap-2"
                    >
                      <TrendingUp className="w-4 h-4" />
                      Promote to {getNextAcademicYear(selectedAcademicYear) || 'Next Year'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Manage Groups</h2>
                    <p className="text-slate-500">View and organize classes for Year {selectedSettingScope}. Groups are automatically created when you import marks.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                  {groups
                    .filter(g => {
                      const scope = selectedSettingScope;
                      // If scope is a specific group name, only show that group
                      if (groups.some(existing => existing.name === scope)) {
                        return g.name === scope && g.academicYear === selectedAcademicYear;
                      }
                      // Otherwise filter by year group
                      return String(g.yearGroup) === String(scope) && g.academicYear === selectedAcademicYear;
                    })
                    .map((group) => {
                      const groupStudents = students.filter(s => 
                        s.groupName === group.name && 
                        String(s.yearGroup) === String(group.yearGroup) &&
                        s.academicYear === selectedAcademicYear
                      );
                      
                      const studentAverages = groupStudents.map(s => {
                        const studentMarks = marks.filter(m => m.studentId === s.id);
                        const sittingMarks = studentMarks.filter(m => !(m as any).absent);
                        if (sittingMarks.length === 0) return null;
                        
                        const totalPerc = sittingMarks.reduce((acc, m) => {
                          const assessment = assessments.find(a => a.id === m.assessmentId);
                          return acc + getMarkPercentage(m, assessment);
                        }, 0);
                        return totalPerc / sittingMarks.length;
                      }).filter((v): v is number => v !== null);

                      const groupAvg = studentAverages.length > 0
                        ? studentAverages.reduce((a, b) => a + b, 0) / studentAverages.length
                        : null;

                      return (
                        <div key={group.id} className="card p-5 flex flex-col gap-4 group relative border-slate-100 hover:border-indigo-200 transition-all">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <input 
                                type="text"
                                className="w-full bg-transparent border-none p-0 font-bold text-lg text-slate-800 outline-none focus:ring-0"
                                value={group.name}
                                onChange={(e) => {
                                  const newName = e.target.value;
                                  setGroups(prev => prev.map(g => g.id === group.id ? { ...g, name: newName } : g));
                                  setStudents(prev => prev.map(s => String(s.yearGroup) === String(group.yearGroup) && s.groupName === group.name ? { ...s, groupName: newName } : s));
                                }}
                                placeholder="Group Name"
                              />
                            </div>
                            <button 
                              onClick={() => handleDeleteGroup(group.id)}
                              className={`p-2 rounded-lg transition-all ${
                                groupStudents.length === 0 
                                  ? 'bg-rose-50 text-rose-600 border border-rose-100 opacity-100' 
                                  : 'text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 focus:opacity-100'
                              }`}
                              title={groupStudents.length === 0 ? "Delete Empty Group" : "Delete Group"}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Average Score</p>
                              <p className="text-lg font-bold text-indigo-600">
                                {groupAvg !== null ? `${groupAvg.toFixed(1)}%` : '—'}
                              </p>
                            </div>
                            <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Students</p>
                              <p className="text-lg font-bold text-slate-700">{groupStudents.length}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Year:</span>
                            <select
                              className="text-xs bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                              value={group.yearGroup}
                              onChange={(e) => {
                                const newYear = e.target.value as YearGroup;
                                const parsedYear = isNaN(Number(newYear)) ? newYear : Number(newYear) as YearGroup;
                                setGroups(prev => prev.map(g => g.id === group.id ? { ...g, yearGroup: parsedYear } : g));
                                setStudents(prev => prev.map(s => String(s.yearGroup) === String(group.yearGroup) && s.groupName === group.name ? { ...s, yearGroup: parsedYear } : s));
                              }}
                            >
                              {[7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'].map(y => (
                                <option key={y} value={y}>{typeof y === 'number' ? `Year ${y}` : y}</option>
                              ))}
                            </select>
                          </div>
                          
                          {(group.yearGroup === '12 IB' || group.yearGroup === '13 IB') && (
                            <div className="flex gap-2 text-[10px] font-bold">
                              <span className="text-violet-600">HL: {groupStudents.filter(s => s.ibLevel === 'HL').length}</span>
                              <span className="text-sky-600">SL: {groupStudents.filter(s => s.ibLevel === 'SL').length}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Bulk Data Import</h2>
                  <p className="text-slate-500">Upload a CSV file to import students, classes, and marks in one go.</p>
                </div>

                <div className="card p-6 bg-indigo-50 border-indigo-100">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="space-y-4 flex-1">
                      <div className="flex items-center gap-3 text-indigo-700">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-bold">1</div>
                        <p className="font-medium">Download the template to see the required format.</p>
                      </div>
                      <div className="flex items-center gap-3 text-indigo-700">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-bold">2</div>
                        <p className="font-medium">Fill in student names, year groups, class names, and marks.</p>
                      </div>
                      <div className="flex items-center gap-3 text-indigo-700">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-bold">3</div>
                        <p className="font-medium">Upload the completed CSV to automatically organize your data.</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-3 w-full md:w-auto">
                      <button 
                        onClick={downloadTemplate}
                        className="btn-primary flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download Template
                      </button>
                      <label className="btn-secondary flex items-center justify-center gap-2 cursor-pointer">
                        <Upload className="w-4 h-4" />
                        Upload Completed File
                        <input type="file" accept=".csv,.xlsx,.xls" multiple onChange={handleFileUpload} className="hidden" />
                      </label>
                    </div>
                  </div>
                  
                  <div className="mt-6 p-4 bg-white rounded-xl border border-indigo-100">
                    <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2 text-center">Expected CSV Headers:</h4>
                    <div className="flex flex-wrap justify-center gap-2">
                      {['Surname', 'Forename (Firstname)', 'Preferred Name', 'Year Group (NC)', 'Year Group Code', 'Assessment Name', 'Score', 'Max Marks'].map(header => (
                        <span key={header} className="px-2 py-1 bg-slate-100 rounded text-[10px] font-mono text-slate-600 border border-slate-200">
                          {header}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-indigo-50 rounded-lg">
                        <Database className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800">Advanced Data Management</h3>
                        <p className="text-xs text-slate-500">Utilities for maintaining system-wide data integrity</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-xl border border-slate-100 group">
                        <div>
                          <p className="text-sm font-bold text-slate-700">Cleanup Duplicate Student Records</p>
                          <p className="text-[11px] text-slate-500 leading-relaxed max-w-lg">
                            Scans for students with the same name across different groups in the same Year Group. 
                            It will merge their baseline grades and move all mark history into a single cohesive record.
                          </p>
                        </div>
                        <button 
                          onClick={consolidateStudents}
                          disabled={saveStatus === 'saving'}
                          className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${saveStatus === 'saving' ? 'animate-spin' : ''}`} />
                          Merge Duplicates
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showAssessmentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-md flex flex-col max-h-[90vh] p-0 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex-shrink-0 bg-white">
                <h3 className="text-xl font-bold text-slate-900">
                  {editingAssessmentId ? 'Edit Assessment' : 'Add New Assessment'}
                </h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 pt-4">
                <form id="assessment-form" onSubmit={handleAddAssessment} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Year Group</label>
                      <select 
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={newAssessment.yearGroup}
                        onChange={e => {
                          const val = e.target.value;
                          const year = (!isNaN(parseInt(val)) && val.length === 1) ? parseInt(val) as YearGroup : val as YearGroup;
                          setNewAssessment({
                            ...newAssessment, 
                            yearGroup: year,
                            subject: SUBJECTS_BY_YEAR[year][0]
                          });
                        }}
                      >
                        {[7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'].map(y => (
                          <option key={y} value={y}>{typeof y === 'number' ? `Year ${y}` : y}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                      <select 
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={newAssessment.subject}
                        onChange={e => setNewAssessment({...newAssessment, subject: e.target.value})}
                      >
                        {SUBJECTS_BY_YEAR[newAssessment.yearGroup].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {/* IB Level for Assessment */}
                  {(newAssessment.yearGroup === '12 IB' || newAssessment.yearGroup === '13 IB') && (
                    <div className="pb-4 border-b border-slate-100">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Scope / Level</label>
                      <div className="flex gap-2">
                        {(['Both', 'HL', 'SL'] as const).map(level => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setNewAssessment({ ...newAssessment, ibLevel: level })}
                            className={`flex-1 px-4 py-2 border rounded-xl font-bold transition-all ${
                              newAssessment.ibLevel === level
                                ? level === 'HL' ? 'bg-violet-600 text-white border-violet-600' : 
                                  level === 'SL' ? 'bg-sky-500 text-white border-sky-500' :
                                  'bg-slate-700 text-white border-slate-700'
                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2">Is this assessment for a specific level or shared by both?</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Name</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newAssessment.name}
                      onChange={e => setNewAssessment({...newAssessment, name: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Max Marks</label>
                      <input 
                        required
                        type="number" 
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={newAssessment.maxMarks}
                        onChange={e => setNewAssessment({...newAssessment, maxMarks: parseInt(e.target.value)})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                      <input 
                        required
                        type="date" 
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={newAssessment.date}
                        onChange={e => setNewAssessment({...newAssessment, date: e.target.value})}
                      />
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-slate-100 flex-shrink-0 bg-white">
                <div className="flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowAssessmentModal(false);
                      setEditingAssessmentId(null);
                      // We don't reset to Year 7 here anymore to preserve context
                    }} 
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button form="assessment-form" type="submit" className="btn-primary flex-1">
                    {editingAssessmentId ? 'Update Assessment' : 'Add Assessment'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showStudentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-md flex flex-col max-h-[90vh] p-0 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex-shrink-0 bg-white">
                <h3 className="text-xl font-bold text-slate-900">{editingStudentId ? 'Edit Student' : 'Add New Student'}</h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 pt-4">
                <form id="student-form" onSubmit={handleAddStudent} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Student Name (Legal)</label>
                    <input 
                      required
                      type="text" 
                      placeholder="e.g. Sarah Ahmed"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newStudent.name}
                      onChange={e => setNewStudent({...newStudent, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Sarah"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newStudent.preferredName}
                      onChange={e => setNewStudent({...newStudent, preferredName: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Year Group / Class Group</label>
                    <div className="flex gap-2">
                      <select 
                        className="flex-1 px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        value={newStudent.yearGroup}
                        onChange={e => {
                          const val = e.target.value;
                          const year = (!isNaN(parseInt(val)) && val.length === 1) ? parseInt(val) as YearGroup : val as YearGroup;
                          const groupsForYear = Array.from(new Set([
                            ...groups.filter(g => String(g.yearGroup) === String(year) && g.academicYear === selectedAcademicYear).map(g => g.name),
                            ...students.filter(s => String(s.yearGroup) === String(year) && s.academicYear === selectedAcademicYear).map(s => s.groupName).filter(Boolean)
                          ])).sort();
                          setNewStudent({...newStudent, yearGroup: year, groupName: groupsForYear[0] || ''});
                        }}
                      >
                        {[7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'].map(y => (
                          <option key={y} value={y}>{typeof y === 'number' ? `Year ${y}` : y}</option>
                        ))}
                      </select>
                      <input 
                        type="text"
                        placeholder="Group (e.g. 7A)"
                        className="w-24 px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={newStudent.groupName}
                        onChange={e => setNewStudent({...newStudent, groupName: e.target.value})}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Baseline Grade</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 7, A*, AT"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newStudent.baselineGrade || ''}
                      onChange={e => setNewStudent({...newStudent, baselineGrade: e.target.value.toUpperCase()})}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Used to identify students performing ≥3 grades below target.</p>
                  </div>
                  {(newStudent.yearGroup === '12 IB' || newStudent.yearGroup === '13 IB') && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">IB Level (for filtering purposes)</label>
                      <div className="flex gap-2">
                        {(['HL', 'SL'] as const).map(level => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setNewStudent({ ...newStudent, ibLevel: newStudent.ibLevel === level ? undefined : level })}
                            className={`flex-1 px-4 py-2 border rounded-xl font-bold transition-all ${
                              newStudent.ibLevel === level 
                                ? level === 'HL' ? 'bg-violet-600 text-white border-violet-600' : 'bg-sky-500 text-white border-sky-500'
                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Is this student in an HL or SL class? (Optional)</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Subjects</label>
                    <div className="flex flex-wrap gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50">
                      {(SUBJECTS_BY_YEAR[newStudent.yearGroup] || []).map(subject => {
                        const currentSubjects: string[] = (newStudent as any).subjects || SUBJECTS_BY_YEAR[newStudent.yearGroup] || [];
                        const isSelected = currentSubjects.includes(subject);
                        return (
                          <button
                            key={subject}
                            type="button"
                            onClick={() => {
                              const current: string[] = (newStudent as any).subjects || [...(SUBJECTS_BY_YEAR[newStudent.yearGroup] || [])];
                              const updated = isSelected ? current.filter(s => s !== subject) : [...current, subject];
                              setNewStudent({...newStudent, subjects: updated} as any);
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                              isSelected 
                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                            }`}
                          >
                            {subject}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Click to toggle — all selected by default</p>
                  </div>
                  {/* HL/SL level selector — only for IB years */}
                  {(newStudent.yearGroup === '12 IB' || newStudent.yearGroup === '13 IB') && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Subject Levels (HL / SL)</label>
                      <div className="space-y-2 p-3 border border-slate-200 rounded-xl bg-slate-50">
                        {((newStudent as any).subjects || SUBJECTS_BY_YEAR[newStudent.yearGroup] || []).map((subject: string) => {
                          const subjectLevels = (newStudent as any).subjectLevels || {};
                          const currentLevel = subjectLevels[subject] || 'SL';
                          return (
                            <div key={subject} className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-700" style={{ color: SUBJECT_COLORS[subject] }}>
                                {subject}
                              </span>
                              <div className="flex gap-1">
                                {(['HL', 'SL'] as const).map(level => (
                                  <button
                                    key={level}
                                    type="button"
                                    onClick={() => {
                                      const existing = (newStudent as any).subjectLevels || {};
                                      setNewStudent({ ...newStudent, subjectLevels: { ...existing, [subject]: level } } as any);
                                    }}
                                    className={`px-3 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                                      currentLevel === level
                                        ? level === 'HL' ? 'bg-violet-600 text-white border-violet-600' : 'bg-sky-500 text-white border-sky-500'
                                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                    }`}
                                  >
                                    {level}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Default is SL — click HL to change</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <div className="flex items-center h-5">
                      <input
                        id="is-new-student"
                        type="checkbox"
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                        checked={newStudent.isNew}
                        onChange={e => setNewStudent({ ...newStudent, isNew: e.target.checked })}
                      />
                    </div>
                    <div className="ml-0 text-sm">
                      <label htmlFor="is-new-student" className="font-bold text-indigo-900 cursor-pointer">Mark as New Student</label>
                      <p className="text-[10px] text-indigo-600/70 italic">Identify students who joined late and may have missed previous assessments.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-indigo-400" />
                      Teacher Notes / Details
                    </label>
                    <textarea
                      value={newStudent.notes}
                      onChange={e => setNewStudent({ ...newStudent, notes: e.target.value })}
                      className="input-field min-h-[80px] py-2 text-xs leading-relaxed resize-none bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                      placeholder="Add details about the student (e.g., joins from different curriculum, specific needs, etc.)"
                    />
                    <p className="text-[9px] text-slate-400 italic">These notes are only visible to teachers.</p>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-slate-100 flex-shrink-0 bg-white">
                <div className="flex gap-3">
                  {editingStudentId && (
                    <button 
                      type="button" 
                      onClick={() => handleDeleteStudent(editingStudentId)} 
                      className="px-4 py-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors border border-rose-100 flex items-center justify-center gap-2 text-xs font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Student
                    </button>
                  )}
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowStudentModal(false);
                      setEditingStudentId(null);
                      setNewStudent(prev => ({ ...prev, name: '', preferredName: '', baselineGrade: '' }));
                    }} 
                    className={`btn-secondary flex-1 ${editingStudentId ? 'flex-[1.5]' : ''}`}
                  >
                    Cancel
                  </button>
                  <button form="student-form" type="submit" className="btn-primary flex-[2]">
                    {editingStudentId ? 'Save Changes' : 'Add Student'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showMarksModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="card w-full h-full md:h-[95vh] md:max-w-[95vw] p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Manage Assessment</h3>
                  <p className="text-sm text-slate-500">
                    {assessments.find(a => a.id === showMarksModal)?.name} • Max Marks: {assessments.find(a => a.id === showMarksModal)?.maxMarks}
                  </p>
                </div>
                <button onClick={() => setShowMarksModal(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <Plus className="w-5 h-5 rotate-45 text-slate-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-hidden">
                <div className="lg:col-span-2 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4" /> Student Marks
                    </h4>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">Entry:</span>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          {(['score', 'percentage', 'grade'] as const).map(mode => (
                            <button
                              key={mode}
                              onClick={() => setMarksEntryMode(mode)}
                              className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase transition-all ${
                                marksEntryMode === mode 
                                  ? 'bg-white text-indigo-600 shadow-sm' 
                                  : 'text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              {mode === 'score' ? 'Marks' : mode === 'percentage' ? '%' : 'Grade'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">Group:</span>
                        <select 
                          className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                          value={marksGroupFilter}
                          onChange={(e) => setMarksGroupFilter(e.target.value)}
                        >
                          <option value="all">All Groups</option>
                          {(() => {
                            const assessment = assessments.find(a => a.id === showMarksModal);
                            // Only show groups that actually have students (prevents ghost groups)
                            const fromStudents = students
                              .filter(s => assessment 
                                ? (normYear(s.yearGroup) === normYear(assessment.yearGroup) && s.academicYear === selectedAcademicYear)
                                : s.academicYear === selectedAcademicYear)
                              .map(s => s.groupName)
                              .filter(Boolean);
                            const allGroups = Array.from(new Set(fromStudents)).sort();
                            return allGroups.map(name => (
                              <option key={name} value={name}>{name}</option>
                            ));
                          })()}
                        </select>
                      </div>
                      {(() => {
                        const assessment = assessments.find(a => a.id === showMarksModal);
                        if (!assessment || !(String(assessment.yearGroup).includes('IB'))) return null;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 uppercase font-bold">Level:</span>
                            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                              {(['all', 'HL', 'SL'] as const).map(l => (
                                <button
                                  key={l}
                                  onClick={() => setMarksLevelFilter(l)}
                                  className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase transition-all ${
                                    marksLevelFilter === l 
                                      ? 'bg-white text-indigo-600 shadow-sm' 
                                      : 'text-slate-400 hover:text-slate-600'
                                  }`}
                                >
                                  {l}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2">
                    {(() => {
                      const assessment = assessments.find(a => a.id === showMarksModal);
                      const rawRelevant = students.filter(s => {
                        const matchesYear = assessment ? normYear(s.yearGroup) === normYear(assessment.yearGroup) : true;
                        const matchesAcademicYear = s.academicYear === selectedAcademicYear;
                        const matchesGroup = marksGroupFilter === 'all' || s.groupName === marksGroupFilter;
                        const matchesLevel = marksLevelFilter === 'all' || s.ibLevel === marksLevelFilter;
                        return matchesYear && matchesAcademicYear && matchesGroup && matchesLevel;
                      });

                      const relevantStudents = rawRelevant;
                      const groupNames = Array.from(new Set(relevantStudents.map(s => s.groupName))).sort((a: any, b: any) => {
                        const aVal = a || '';
                        const bVal = b || '';
                        if (aVal === '') return -1;
                        if (bVal === '') return 1;
                        return aVal.localeCompare(bVal);
                      });

                      return groupNames.map(groupName => {
                        const groupStudents = relevantStudents
                          .filter(s => s.groupName === groupName)
                          .sort((a, b) => a.name.localeCompare(b.name));
                        
                        return (
                          <div key={groupName} className="mb-6">
                            <div className="flex items-center justify-between px-2 py-1 bg-slate-100 rounded-lg mb-2">
                              <h5 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Group {groupName || 'Unassigned'}</h5>
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const unmarked = groupStudents.filter(s => !marks.find(m => m.studentId === s.id && m.assessmentId === showMarksModal)).length;
                                  return unmarked > 0 ? (
                                    <span className="text-[9px] font-bold text-amber-500">{unmarked} unmarked</span>
                                  ) : (
                                    <span className="text-[9px] font-bold text-emerald-500">All marked ✓</span>
                                  );
                                })()}
                                <span className="text-[9px] text-slate-400 font-bold">{groupStudents.length} students</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {groupStudents.map(student => {
                                const mark = marks.find(m => m.studentId === student.id && m.assessmentId === showMarksModal);
                                return (
                                  <div key={student.id} className={`flex items-center justify-between p-1.5 rounded-lg border shadow-sm ${mark === undefined ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100'}`}>
                                    <div className="min-w-0 flex-1 mr-2">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <p className="font-bold text-slate-900 text-[11px] truncate">{student.name}</p>
                                        {/* Show HL/SL badge for the subject of this assessment */}
                                        {(() => {
                                          const assessmentSubject = assessments.find(a => a.id === showMarksModal)?.subject;
                                          const level = assessmentSubject && (student as any).subjectLevels?.[assessmentSubject];
                                          if (!level) return null;
                                          return (
                                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                                              level === 'HL' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-sky-50 text-sky-700 border-sky-200'
                                            }`}>{level}</span>
                                          );
                                        })()}
                                      </div>
                                      {mark === undefined && (
                                        <span className="text-[8px] font-bold text-amber-500 uppercase tracking-wide">Not marked</span>
                                      )}
                                      {(mark as any)?.absent && (
                                        <span className="text-[8px] font-bold text-rose-500 uppercase tracking-wide">Absent — excluded from avg</span>
                                      )}
                                      {mark?.resitScore !== undefined && (
                                        <span className="text-[8px] font-bold text-indigo-500 uppercase tracking-wide">Using avg (Score + Resit)</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {/* Delete Student (for cleaning up duplicates) */}
                                      <button
                                        type="button"
                                        title="Delete student record"
                                        onClick={() => {
                                          if (confirm(`Are you sure you want to delete ${student.name}? This will remove all their data.`)) {
                                            handleDeleteStudent(student.id);
                                          }
                                        }}
                                        className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-all"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                      {/* Absent toggle */}
                                      <button
                                        type="button"
                                        title={(mark as any)?.absent ? 'Mark as present' : 'Mark as absent'}
                                        onClick={() => handleMarkAbsent(student.id, showMarksModal, !(mark as any)?.absent)}
                                        className={`text-[8px] font-bold px-1.5 py-0.5 rounded border transition-all ${
                                          (mark as any)?.absent
                                            ? 'bg-rose-500 text-white border-rose-500'
                                            : 'bg-white text-slate-300 border-slate-200 hover:text-rose-400 hover:border-rose-200'
                                        }`}
                                      >
                                        ABS
                                      </button>
                                      <div className="flex flex-col gap-1 items-end">
                                        {marksEntryMode === 'score' && (
                                          <input 
                                            type="number" 
                                            placeholder="Score"
                                            disabled={(mark as any)?.absent}
                                            className={`w-14 px-1.5 py-0.5 border rounded text-[11px] outline-none focus:ring-2 focus:ring-indigo-500 ${
                                              (mark as any)?.absent
                                                ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                                                : mark === undefined ? 'bg-amber-50 border-amber-200 placeholder-amber-300' : 'bg-white border-slate-200'
                                            }`}
                                            value={(mark as any)?.absent ? '' : (mark?.score ?? '')}
                                            min="0"
                                            max={assessment?.maxMarks || 100}
                                            onChange={e => {
                                              const val = e.target.value;
                                              handleUpdateMark(student.id, showMarksModal, val === '' ? null : parseFloat(val));
                                            }}
                                          />
                                        )}
                                        {marksEntryMode === 'percentage' && (
                                          <div className="relative">
                                            <input 
                                              type="number" 
                                              placeholder="%"
                                              disabled={(mark as any)?.absent}
                                              className={`w-14 px-1.5 py-0.5 pr-4 border rounded text-[11px] outline-none focus:ring-2 focus:ring-indigo-500 ${
                                                (mark as any)?.absent
                                                  ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                                                  : mark === undefined ? 'bg-amber-50 border-amber-200 placeholder-amber-300' : 'bg-white border-slate-200'
                                              }`}
                                              value={(mark as any)?.absent ? '' : (mark ? Math.round((mark.score / (assessment?.maxMarks || 1)) * 100) : '')}
                                              min="0"
                                              max="100"
                                              onChange={e => {
                                                const val = e.target.value;
                                                handleUpdateMarkByPercentage(student.id, showMarksModal, val === '' ? null : parseFloat(val));
                                              }}
                                            />
                                            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-slate-400">%</span>
                                          </div>
                                        )}
                                        {marksEntryMode === 'grade' && (
                                          <select
                                            disabled={(mark as any)?.absent}
                                            className={`w-28 px-1.5 py-0.5 border rounded text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 ${
                                              (mark as any)?.absent
                                                ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                                                : mark === undefined ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200 text-indigo-600'
                                            }`}
                                            value={(() => {
                                               if (!mark) return '';
                                               const boundaries = assessment?.boundaries || getStudentBoundaries(student);
                                               return getGrade((mark.score / (assessment?.maxMarks || 1)) * 100, boundaries);
                                            })()}
                                            onChange={e => handleUpdateMarkByGrade(student.id, showMarksModal, e.target.value)}
                                          >
                                            <option value="">— Grade —</option>
                                            {(assessment?.boundaries || getStudentBoundaries(student)).map(b => (
                                              <option key={b.grade} value={b.grade}>{b.grade}</option>
                                            ))}
                                          </select>
                                        )}
                                        
                                        {marksEntryMode !== 'grade' && (
                                          <div className="flex gap-1">
                                            <input 
                                              type="number" 
                                              placeholder="Resit"
                                              disabled={(mark as any)?.absent}
                                              className={`w-14 px-1.5 py-0.5 border border-dashed rounded text-[11px] outline-none focus:ring-2 focus:ring-indigo-500 ${
                                                (mark as any)?.absent
                                                  ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                                                  : 'bg-indigo-50 border-indigo-200 placeholder-indigo-300'
                                              }`}
                                              value={(mark as any)?.absent ? '' : (mark?.resitScore ?? '')}
                                              min="0"
                                              max={mark?.resitMaxMarks || assessment?.maxMarks || 100}
                                              onChange={e => {
                                                const val = e.target.value;
                                                handleUpdateResitMark(student.id, showMarksModal, val === '' ? null : parseFloat(val));
                                              }}
                                            />
                                            <input 
                                              type="number" 
                                              placeholder="Max"
                                              disabled={(mark as any)?.absent}
                                              className={`w-10 px-1 py-0.5 border border-slate-100 rounded text-[9px] outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-slate-500 font-bold`}
                                              value={(mark as any)?.absent ? '' : (mark?.resitMaxMarks ?? '')}
                                              min="1"
                                              onChange={e => {
                                                const val = e.target.value;
                                                handleUpdateResitMax(student.id, showMarksModal, val === '' ? null : parseFloat(val));
                                              }}
                                            />
                                          </div>
                                        )}
                                      </div>
                                      <span className={`text-[9px] font-bold w-7 text-right ${
                                        (mark as any)?.absent ? 'text-rose-400' : mark === undefined ? 'text-amber-400' : 'text-slate-400'
                                      }`}>
                                        {(() => {
                                          if ((mark as any)?.absent) return 'ABS';
                                          if (!mark) return '—';
                                          const score = mark.score;
                                          const resit = mark.resitScore;
                                          const finalScore = resit !== undefined ? (score / (assessment?.maxMarks || 1) * 100 + resit / (mark.resitMaxMarks || assessment?.maxMarks || 1) * 100) / 2 : (score / (assessment?.maxMarks || 1) * 100);
                                          return `${finalScore.toFixed(0)}%`;
                                        })()}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <Settings className="w-4 h-4" /> Assessment Boundaries
                    </h4>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          const assessment = assessments.find(a => a.id === showMarksModal)!;
                          setAssessments(prev => prev.map(a => a.id === showMarksModal ? { ...a, isLocked: !a.isLocked } : a));
                        }}
                        className={`p-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                          assessments.find(a => a.id === showMarksModal)?.isLocked 
                            ? 'bg-amber-50 border-amber-200 text-amber-600' 
                            : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
                        }`}
                        title={assessments.find(a => a.id === showMarksModal)?.isLocked ? "Unlock to edit" : "Lock boundaries"}
                      >
                        {assessments.find(a => a.id === showMarksModal)?.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        <span className="text-[10px] uppercase font-bold tracking-wider">
                          {assessments.find(a => a.id === showMarksModal)?.isLocked ? "Locked" : "Unlocked"}
                        </span>
                      </button>
                      <button 
                        onClick={() => setShowBoundaryShare(showMarksModal)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100 flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5 rotate-45" /> 
                        <span className="text-[10px] uppercase font-bold tracking-wider">Share</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                    <div className="flex items-start gap-2 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                      <AlertCircle className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                      <p className="text-[10px] text-indigo-700 leading-relaxed font-medium">
                        Custom boundaries for this assessment. If not set, class defaults will be used. 
                        {assessments.find(a => a.id === showMarksModal)?.isLocked && " Editing is currently locked."}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {(assessments.find(a => a.id === showMarksModal)?.boundaries || yearBoundaries[marksGroupFilter] || yearBoundaries[assessments.find(a => a.id === showMarksModal)?.yearGroup || 7] || [])
                        .sort((a, b) => b.minPercentage - a.minPercentage)
                        .map((boundary, idx) => {
                          const assessment = assessments.find(a => a.id === showMarksModal)!;
                          const sourceBoundaries = assessment.boundaries || yearBoundaries[marksGroupFilter] || yearBoundaries[assessment.yearGroup] || [];
                          const originalIdx = sourceBoundaries.indexOf(boundary);

                          return (
                            <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                              assessment.isLocked ? 'bg-slate-100/50 border-slate-100 opacity-80' : 'bg-slate-50 border-slate-100'
                            }`}>
                              <div className="flex flex-col items-center">
                                <span className="text-[7px] text-slate-400 uppercase font-bold mb-0.5">Grade</span>
                                <input 
                                  type="text"
                                  disabled={assessment.isLocked}
                                  className={`w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center font-bold text-indigo-600 text-center text-xs outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm ${assessment.isLocked ? 'cursor-not-allowed text-slate-400' : ''}`}
                                  value={boundary.grade}
                                  onChange={(e) => {
                                    if (assessment.isLocked) return;
                                    const currentBoundaries = [...sourceBoundaries];
                                    currentBoundaries[originalIdx].grade = e.target.value;
                                    setAssessments(prev => prev.map(a => a.id === showMarksModal ? { ...a, boundaries: currentBoundaries } : a));
                                  }}
                                />
                              </div>
                              <div className="flex-1">
                                <div className="flex justify-between text-[10px] mb-1">
                                  <span className="text-slate-500">Min %</span>
                                  <div className="flex items-center gap-1">
                                    <input 
                                      type="number"
                                      min="0"
                                      max="100"
                                      disabled={assessment.isLocked}
                                      value={boundary.minPercentage}
                                      onChange={(e) => {
                                        if (assessment.isLocked) return;
                                        const val = parseInt(e.target.value) || 0;
                                        const currentBoundaries = [...sourceBoundaries];
                                        currentBoundaries[originalIdx].minPercentage = Math.min(100, Math.max(0, val));
                                        setAssessments(prev => prev.map(a => a.id === showMarksModal ? { ...a, boundaries: currentBoundaries } : a));
                                      }}
                                      className={`w-12 px-1 py-0.5 text-right font-bold text-slate-900 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500 text-[10px] ${assessment.isLocked ? 'cursor-not-allowed bg-slate-50 text-slate-400' : ''}`}
                                    />
                                    <span className={`font-bold text-[10px] ${assessment.isLocked ? 'text-slate-400' : 'text-slate-900'}`}>%</span>
                                  </div>
                                </div>
                                <input 
                                  type="range" 
                                  min="0" 
                                  max="100" 
                                  disabled={assessment.isLocked}
                                  value={boundary.minPercentage}
                                  onChange={(e) => {
                                    if (assessment.isLocked) return;
                                    const currentBoundaries = [...sourceBoundaries];
                                    currentBoundaries[originalIdx].minPercentage = parseInt(e.target.value);
                                    setAssessments(prev => prev.map(a => a.id === showMarksModal ? { ...a, boundaries: currentBoundaries } : a));
                                  }}
                                  className={`w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 ${assessment.isLocked ? 'cursor-not-allowed opacity-50' : ''}`}
                                />
                              </div>
                              {!assessment.isLocked && (
                                <button 
                                  onClick={() => {
                                    const currentBoundaries = sourceBoundaries.filter((_, i) => i !== originalIdx);
                                    setAssessments(prev => prev.map(a => a.id === showMarksModal ? { ...a, boundaries: currentBoundaries } : a));
                                  }}
                                  className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      {!assessments.find(a => a.id === showMarksModal)?.isLocked && (
                        <button 
                          onClick={() => handleAddGrade(true, showMarksModal)}
                          className="w-full py-2 border border-dashed border-slate-300 rounded-xl text-indigo-600 font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add Grade Level
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <AlertCircle className="w-3 h-3" />
                  <span>Note: Students marked as <strong>ABS</strong> (Absent) are excluded from all average calculations.</span>
                </div>
                <button onClick={() => setShowMarksModal(null)} className="btn-primary px-8">Save and Close</button>
              </div>
            </motion.div>
          </div>
        )}
        {showPaperGradingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">
                      Question-Level Grading: {assessments.find(a => a.id === showPaperGradingModal)?.name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {assessments.find(a => a.id === showPaperGradingModal)?.subject} • {formatYearGroup(assessments.find(a => a.id === showPaperGradingModal)?.yearGroup || 7)}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowPaperGradingModal(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col p-6">
                {!assessments.find(a => a.id === showPaperGradingModal)?.questions ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                    <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 mb-6">
                      <Upload className="w-10 h-10" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-900 mb-2">Upload Exam Paper</h4>
                    <p className="text-slate-500 max-w-md mb-8">
                      Upload the exam paper (PDF or Image) and AI will automatically extract question numbers and their maximum marks.
                    </p>

                    <div className="flex items-center gap-4 mb-8 p-1 bg-slate-100 rounded-2xl w-full max-w-md">
                      <button 
                        onClick={() => setExtractionMode('questions')}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${extractionMode === 'questions' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Main Questions Only
                      </button>
                      <button 
                        onClick={() => setExtractionMode('subparts')}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${extractionMode === 'subparts' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Include Sub-parts (1a, 1b)
                      </button>
                    </div>
                    
                    <label className="btn-primary cursor-pointer flex items-center gap-2 px-8">
                      {isExtracting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Extracting Questions...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          Select Paper to Extract
                        </>
                      )}
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*,application/pdf"
                        disabled={isExtracting}
                        onChange={(e) => handlePaperUpload(e, showPaperGradingModal)}
                      />
                    </label>

                    {extractionError && (
                      <div className="mt-6 flex items-center gap-2 text-rose-600 bg-rose-50 px-4 py-2 rounded-xl border border-rose-100">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">{extractionError}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-wider">
                            {assessments.find(a => a.id === showPaperGradingModal)?.questions?.length} Questions Extracted
                          </span>
                        </div>
                        <div className="text-sm font-bold text-slate-600">
                          Total Marks: <span className="text-slate-900">{assessments.find(a => a.id === showPaperGradingModal)?.maxMarks}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filter Group</span>
                          <select 
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
                            value={modalGroupFilter}
                            onChange={(e) => setModalGroupFilter(e.target.value)}
                          >
                            <option value="all">All Groups</option>
                            {Array.from(new Set(students
                              .filter(s => {
                                const assessment = assessments.find(a => a.id === showPaperGradingModal);
                                if (!assessment) return false;
                                return s.academicYear === selectedAcademicYear && normYear(s.yearGroup) === normYear(assessment.yearGroup);
                              })
                              .map(s => s.groupName)
                            )).sort().map(g => (
                              <option key={g} value={g}>{g || 'Unassigned'}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                          <button 
                            onClick={() => setExtractionMode('questions')}
                            className={`py-1 px-3 rounded-lg text-[10px] font-bold transition-all ${extractionMode === 'questions' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                          >
                            Questions
                          </button>
                          <button 
                            onClick={() => setExtractionMode('subparts')}
                            className={`py-1 px-3 rounded-lg text-[10px] font-bold transition-all ${extractionMode === 'subparts' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                          >
                            Sub-parts
                          </button>
                        </div>
                        <label className="text-xs text-indigo-600 font-bold cursor-pointer hover:underline flex items-center gap-1">
                          <Upload className="w-3 h-3" />
                          Re-upload Paper
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*,application/pdf"
                            onChange={(e) => handlePaperUpload(e, showPaperGradingModal)}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl shadow-sm bg-white">
                      <table className="w-full border-collapse text-left">
                        <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[200px]">Student Name</th>
                            {assessments.find(a => a.id === showPaperGradingModal)?.questions?.map(q => (
                              <th key={q.number} className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center min-w-[80px]">
                                Q{q.number}
                                <div className="text-[8px] font-normal text-slate-400">/{q.maxMarks}</div>
                              </th>
                            ))}
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right min-w-[100px]">Total Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(() => {
                            const assessment = assessments.find(a => a.id === showPaperGradingModal)!;
                            const rawRelevant = students.filter(s => 
                              s.academicYear === selectedAcademicYear && 
                              normYear(s.yearGroup) === normYear(assessment.yearGroup) &&
                              (modalGroupFilter === 'all' || s.groupName === modalGroupFilter)
                            );

                            // De-duplicate by name if they are in the same year (normalized)
                            // Prefer the one that has a group name
                            const relevantStudents: Student[] = [];
                            const seenNames = new Set<string>();
                            
                            // Sort to prefer those with groupName
                            const sortedRaw = [...rawRelevant].sort((a, b) => {
                              if (a.groupName && !b.groupName) return -1;
                              if (!a.groupName && b.groupName) return 1;
                              return 0;
                            });

                            for (const s of sortedRaw) {
                              const key = `${s.name.trim().toLowerCase()}|${normYear(s.yearGroup)}`;
                              if (!seenNames.has(key)) {
                                relevantStudents.push(s);
                                seenNames.add(key);
                              }
                            }

                            const groupNames = Array.from(new Set(relevantStudents.map(s => s.groupName))).sort();
                            
                            return groupNames.map(groupName => {
                              const groupStudents = relevantStudents
                                .filter(s => s.groupName === groupName)
                                .sort((a, b) => a.name.localeCompare(b.name));
                              
                              return (
                                <React.Fragment key={groupName}>
                                  <tr className="bg-slate-50/50">
                                    <td 
                                      colSpan={(assessment.questions?.length || 0) + 2} 
                                      className="px-4 py-1.5 text-[10px] font-bold text-indigo-500 uppercase tracking-widest border-y border-slate-100"
                                    >
                                      Group {groupName || 'Unassigned'}
                                    </td>
                                  </tr>
                                  {groupStudents.map(student => {
                                    const mark = marks.find(m => m.studentId === student.id && m.assessmentId === showPaperGradingModal);
                                    return (
                                      <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-4 py-3">
                                          <div className="font-bold text-slate-900 text-sm">{student.name}</div>
                                        </td>
                                        {assessment.questions?.map(q => (
                                          <td key={q.number} className="px-3 py-3 text-center">
                                            <input 
                                              type="number"
                                              min="0"
                                              max={q.maxMarks}
                                              className="w-14 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm text-center font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                              value={mark?.questionScores?.[q.number] ?? ''}
                                              onChange={(e) => updateQuestionScore(student.id, assessment.id, q.number, parseFloat(e.target.value) || 0)}
                                            />
                                          </td>
                                        ))}
                                        <td className="px-4 py-3 text-right">
                                          <div className="flex flex-col items-end">
                                            <span className="text-sm font-bold text-indigo-600">
                                              {mark?.score ?? 0} / {assessment.maxMarks}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-400">
                                              {mark ? ((mark.score / assessment.maxMarks) * 100).toFixed(1) : '0.0'}%
                                            </span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button 
                  onClick={() => setShowPaperGradingModal(null)}
                  className="btn-primary px-8"
                >
                  Save and Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-md flex flex-col max-h-[90vh] p-0 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex-shrink-0 bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Confirm Import</h3>
                    <p className="text-sm text-slate-500">File: {pendingImport?.fileName}.csv</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Academic Year</label>
                  <select 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                    value={selectedAcademicYear}
                    onChange={e => setSelectedAcademicYear(e.target.value)}
                  >
                    {ACADEMIC_YEARS.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Year Group</label>
                    <select 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                      value={importConfig.yearGroup}
                      onChange={e => {
                        const val = e.target.value;
                        const year = (!isNaN(parseInt(val)) && val.length === 1) ? parseInt(val) as YearGroup : val as YearGroup;
                        setImportConfig({ ...importConfig, yearGroup: year, subject: SUBJECTS_BY_YEAR[year][0] });
                      }}
                    >
                      {[7, 8, 9, '10 IGCSE', '11 IGCSE', '12 IB', '13 IB', 'Graduated'].map(y => (
                        <option key={y} value={y}>{typeof y === 'number' ? `Year ${y}` : y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Class Name</label>
                    {importPreview && importPreview.groups && importPreview.groups.length > 0 ? (
                      <div className="w-full px-4 py-2 border border-green-300 bg-green-50 rounded-xl text-green-700 font-bold text-sm flex items-center gap-2">
                        <span>✓ Auto-detected: {importPreview.groups.join(', ')}</span>
                      </div>
                    ) : (
                      <input 
                        type="text"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                        value={importConfig.groupName}
                        onChange={e => setImportConfig({ ...importConfig, groupName: e.target.value })}
                        placeholder="e.g. 10A"
                      />
                    )}
                  </div>
                </div>

                {/* Assessment Config — Hide if simple classlist detected */}
                {importPreview && importPreview.marks > 0 && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Assessment Name</label>
                      <input 
                        type="text"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
                        value={importConfig.assessmentName}
                        onChange={e => setImportConfig({ ...importConfig, assessmentName: e.target.value })}
                        placeholder="e.g. End of Term Test"
                        disabled={importConfig.assessmentName.includes('Multiple')}
                      />
                      {importConfig.assessmentName.includes('Multiple') && (
                        <p className="text-[10px] text-indigo-600 mt-1 font-medium">
                          ✨ Multi-assessment detected! The system will use names from your CSV.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Subject</label>
                        <select 
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                          value={importConfig.subject}
                          onChange={e => setImportConfig({ ...importConfig, subject: e.target.value })}
                        >
                          {SUBJECTS_BY_YEAR[importConfig.yearGroup].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Max Marks</label>
                        <input 
                          type="number"
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                          value={importConfig.maxMarks}
                          onChange={e => setImportConfig({ ...importConfig, maxMarks: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Date</label>
                      <input 
                        type="date"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                        value={importConfig.date}
                        onChange={e => setImportConfig({ ...importConfig, date: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {/* Preview panel */}
                {importPreview && (
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Import Preview</p>
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="bg-white rounded-lg p-2 border border-indigo-100">
                        <p className="text-lg font-bold text-indigo-600">{importPreview.students}</p>
                        <p className="text-[10px] text-slate-500">Students</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-indigo-100">
                        {importPreview.marks > 0 ? (
                          <>
                            <p className="text-lg font-bold text-indigo-600">{importPreview.marks}</p>
                            <p className="text-[10px] text-slate-500">Marks Found</p>
                          </>
                        ) : (
                          <>
                            <p className="text-lg font-bold text-emerald-500 flex items-center justify-center">
                              <CheckCircle2 className="w-5 h-5" />
                            </p>
                            <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-tighter">Classlist Mode</p>
                          </>
                        )}
                      </div>
                    </div>
                    {importPreview.groups && importPreview.groups.length > 0 && (
                      <div className="bg-white rounded-lg p-2 border border-green-200">
                        <p className="text-[10px] font-bold text-green-700 mb-1">GROUPS DETECTED</p>
                        <div className="flex flex-wrap gap-1">
                          {importPreview.groups.map(g => (
                            <span key={g} className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-bold">{g}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(importColumnSubjects).length > 0 ? (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">
                          Assessments detected — assign a subject to each:
                        </p>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {Object.entries(importColumnSubjects).map(([col, subject]) => {
                            // Parse name and maxMarks from column header for display
                            const marksMatch = col.match(/\((\d+)\)/);
                            const maxMarks = marksMatch ? parseInt(marksMatch[1]) : importConfig.maxMarks;
                            let displayName = marksMatch ? col.replace(marksMatch[0], '').trim() : col;
                            // Strip subject suffix if auto-detected
                            const dashMatch = displayName.match(/^(.+?)\s*[-–—]\s*(.+)$/);
                            if (dashMatch) displayName = dashMatch[1].trim();
                            return (
                              <div key={col} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-indigo-100">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-bold text-slate-800 truncate">{displayName}</p>
                                  <p className="text-[9px] text-slate-400">{maxMarks} marks</p>
                                </div>
                                <select
                                  className={`text-[10px] font-bold border rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-400 ${
                                    !subject ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                  }`}
                                  value={subject}
                                  onChange={e => setImportColumnSubjects(prev => ({ ...prev, [col]: e.target.value }))}
                                >
                                  <option value="">— pick subject —</option>
                                  {SUBJECTS_BY_YEAR[importConfig.yearGroup].map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                        {Object.values(importColumnSubjects).some(s => !s) && (
                          <p className="text-[10px] text-amber-600 mt-1.5 font-medium">
                            ⚠ Assign a subject to every assessment before importing.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
                        ⚠ No assessment columns detected. Check column headers include max marks e.g. "Test 1 (50)".
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 flex-shrink-0 bg-white">
                <div className="flex gap-3">
                  <button 
                    onClick={() => { setShowImportModal(false); setPendingImport(null); setImportPreview(null); }}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={previewImport}
                    className="btn-secondary flex-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                  >
                    Preview
                  </button>
                  <button 
                    onClick={() => { confirmImport(); setImportPreview(null); setImportColumnSubjects({}); }}
                    className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={
                      !importPreview ||
                      importPreview.students === 0 ||
                      (Object.keys(importColumnSubjects).length > 0 && Object.values(importColumnSubjects).some(s => !s))
                    }
                  >
                    Import
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBoundaryShare && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm"
            >
              <div 
                className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col"
                id="grade-boundary-card"
              >
                <div className="bg-indigo-600 p-8 text-white text-center flex-shrink-0">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Grade Boundaries</h3>
                  <p className="text-indigo-100 text-xs font-medium mt-1">
                    {(() => {
                      const assessment = assessments.find(a => a.id === showBoundaryShare);
                      if (assessment) return `${assessment.name} • ${formatYearGroup(assessment.yearGroup)}`;
                      return `Year Group: ${showBoundaryShare}`;
                    })()}
                  </p>
                </div>
                
                <div className="p-8 overflow-y-auto flex-1">
                  <div className="space-y-3">
                    {(() => {
                      const assessment = assessments.find(a => a.id === showBoundaryShare);
                      const boundaries = (assessment?.boundaries || yearBoundaries[showBoundaryShare!] || yearBoundaries[assessment?.yearGroup || 7] || [])
                        .sort((a, b) => b.minPercentage - a.minPercentage);
                        
                      return boundaries.map((b, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-transform hover:scale-[1.02]">
                          <span className="font-black text-slate-900 text-lg">{b.grade}</span>
                          <div className="text-right">
                            <span className="block text-indigo-600 font-black text-xl">{b.minPercentage}%</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Minimum</span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                  
                  <div className="mt-8 flex flex-col gap-3">
                    <button 
                      onClick={() => {
                        try {
                          const assessment = assessments.find(a => a.id === showBoundaryShare);
                          const boundaries = (assessment?.boundaries || yearBoundaries[showBoundaryShare!] || yearBoundaries[assessment?.yearGroup || 7] || [])
                            .sort((a, b) => b.minPercentage - a.minPercentage);
                          
                          const text = boundaries.map(b => `${b.grade}: ${b.minPercentage}%`).join('\n');
                          navigator.clipboard.writeText(text);
                        } catch (err) {
                          console.error('Clipboard failed', err);
                        }
                      }}
                      className="w-full py-4 bg-indigo-50 text-indigo-700 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Copy as Text
                    </button>
                    <button 
                      onClick={() => setShowBoundaryShare(null)} 
                      className="w-full py-4 text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors"
                    >
                      Close Card
                    </button>
                  </div>
                  
                  <p className="mt-6 text-[10px] text-slate-300 text-center font-medium italic">
                    Science Progress Tracker • {selectedAcademicYear}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedGroupDetails && <GroupDetailsModal />}
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center"
            >
              <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 ${confirmModal.type === 'danger' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">{confirmModal.title}</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmModal.onConfirm}
                  className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold text-white transition-all shadow-lg active:scale-95 ${confirmModal.type === 'danger' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' : 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'}`}
                >
                  {confirmModal.confirmText || 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 z-50 flex items-center justify-around shadow-[0_-4px_10px_-2px_rgba(0,0,0,0.05)]">
        {[
          { id: 'dashboard', icon: BarChart3, label: 'Stats' },
          { id: 'performance', icon: TrendingUp, label: 'Marks' },
          { id: 'students', icon: Users, label: 'Kids' },
          { id: 'concerns', icon: AlertCircle, label: 'Alerts' },
          { id: 'assessments', icon: Plus, label: 'Add' },
          { id: 'settings', icon: Settings, label: 'Prep' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all ${
              activeTab === tab.id 
                ? 'text-indigo-600' 
                : 'text-slate-400'
            }`}
          >
            <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">{tab.label}</span>
          </button>
        ))}
      </nav>

      <footer className="bg-white border-t border-slate-200 py-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500">© {new Date().getFullYear()} Pooja Arora. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
