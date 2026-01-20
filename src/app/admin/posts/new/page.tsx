import PostForm from "../_components/PostForm";
import { createPost } from "../../actions";

export default function NewPostPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create New Post</h1>
      <PostForm action={createPost} />
    </div>
  );
}
