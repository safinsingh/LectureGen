import { CreateLectureQuestion, FileUpload, LecturePreferences } from "schema";

// type AssetCache = {
//   [doc_ref_id: string]: ;
// };
//inmem cache. heheheheheh

export const ASSET_CACHE = new Map<
  string,
  {
    uid: string;
    file_uploads: FileUpload[];
    user_preferences: LecturePreferences;
    custom_preferences?: LecturePreferences;
    questions: CreateLectureQuestion[];
    lecture_topic: string;
  }
>(); // map stub_id --> file contents
