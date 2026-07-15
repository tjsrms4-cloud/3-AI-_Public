export interface TaskItem {
  title: string;
  originalDeadline: string;
  normalizedDeadline: string;
  formattedDeadlineText: string;
  isUncertain: boolean;
  uncertaintyReason?: string;
  dependencies?: string[];
  originalText?: string;
  completed?: boolean; // Client-side state to track completion
}

export interface AssigneeGroup {
  assignee: string;
  tasks: TaskItem[];
}

export interface GeneralReviewNeed {
  type: "conflict" | "ambiguity" | "general";
  description: string;
}

export interface DistillResponse {
  meetingTitle: string;
  meetingDate: string;
  groups: AssigneeGroup[];
  generalReviewNeeds: GeneralReviewNeed[];
  rawMarkdownOutput: string;
}

export interface MeetingHistoryItem {
  id: string;
  title: string;
  date: string;
  rawText: string;
  result: DistillResponse;
  createdAt: string;
}
