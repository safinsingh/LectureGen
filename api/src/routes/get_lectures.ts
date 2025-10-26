import { RouteHandler } from "fastify";
import { DecodedIdToken } from "firebase-admin/auth";
import { get_user_profile, lectureDoc } from "../lib/firebase_admin.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: DecodedIdToken;
  }
}

export const get_lectures: RouteHandler = async (req, res) => {
  const { uid } = req.user!;
  const lecture_ids = (await get_user_profile(uid).then(
    (user) => user?.lectures
  ))!;
  const lectures = await Promise.all(
    lecture_ids.map((id) =>
      lectureDoc(id)
        .get()
        .then((d) => d.data())
        .then((d) => ({ lecture_id: id, lecture_topic: d!.topic }))
    )
  );
  return res.code(200).send({
    success: true,
    lectures,
  });
};
