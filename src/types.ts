export interface Resident {
  id: string;
  name: string;
  propertyType: 'Perumahan' | 'Ruko';
  houseNumber: string;
  block?: string;
  phone?: string;
  joinDate: string;
  userId?: string;
  monthlyDues?: number;
  photoUrl?: string;
}

export interface Payment {
  id: string;
  residentId: string;
  amount: number;
  date: string;
  month: number;
  year: number;
  proofOfPayment?: string;
  status?: 'pending' | 'verified' | 'tertunda';
}

export type AppView = 'dashboard' | 'residents' | 'payments' | 'reports' | 'settings';

export type NotificationAudience = 'all' | 'admin' | 'resident';
export type NotificationCategory = 'payment' | 'reminder' | 'system';

export interface AddNotificationOptions {
  targetView?: AppView;
  audience?: NotificationAudience;
  recipientResidentId?: string;
  category?: NotificationCategory;
  initialReadBy?: string[];
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  readBy?: string[];
  targetView?: AppView;
  audience?: NotificationAudience;
  recipientResidentId?: string;
  category?: NotificationCategory;
}

export interface MonthlyReport {
  month: number;
  year: number;
  totalCollected: number;
  expectedTotal: number;
  paidCount: number;
  unpaidCount: number;
}

export interface Expense {
  id: string;
  amount: number;
  description: string;
  date: string;
  month: number;
  year: number;
  proofPhoto?: string;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface OrganizationContact {
  id: string;
  name: string;
  roleTitle: string;
  whatsapp: string;
}

export type UserRole = 'admin' | 'resident';

export interface AppUser {
  uid: string;
  email: string | null;
  name?: string;
  photoUrl?: string;
  role: UserRole;
  residentId?: string; // If role is resident, link to resident record
  passwordUpdatedAt?: string;
}
