import { z } from "zod";
import { OpenAI } from "openai";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const openai = new OpenAI();

const calculate = (expression: string): number => {
  console.log(expression);
  const validChars = /[-()\d/*+.]/g;
  if (!validChars.test(expression)) return NaN;
  const ev = eval(expression) as number;
  return ev;
};
export const apiRouter = createTRPCRouter({
  calculate: publicProcedure
    .input(z.object({ expression: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { expression } = input;
      const gptOut = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a calculator. You will recieve a math problem and return the answer. Your answer should only contain numbers",
          },
          { role: "user", content: expression },
        ],
        model: "gpt-3.5-turbo",
      });

      const msg = gptOut ? gptOut.choices[0]?.message?.content : "No response";
      const trueAns = calculate(expression);

      if (trueAns === Number(msg)) {
        await ctx.db.unreliableCalculator_stats.create({
          data: {
            correct: true,
            offset: 0,
          },
        });
      } else {
        const offset = Math.abs(trueAns - Number(msg));
        console.log("OFFSET: " + offset);
        await ctx.db.unreliableCalculator_stats.create({
          data: {
            correct: false,
            offset: offset,
          },
        });
      }
      return msg;
    }),
  getStats: publicProcedure.query(async ({ ctx }) => {
    const correct = await ctx.db.unreliableCalculator_stats.count({
      where: { correct: true },
    });
    const incorrect = await ctx.db.unreliableCalculator_stats.count({
      where: { correct: false },
    });
    const largestOffset = await ctx.db.unreliableCalculator_stats.findFirst({
      orderBy: { offset: "desc" },
    });
    const smallestOffset = await ctx.db.unreliableCalculator_stats.findFirst({
      orderBy: { offset: "asc" },
    });
    const averageOffset = await ctx.db.unreliableCalculator_stats.aggregate({
      _avg: { offset: true },
    });

    return {
      correct,
      incorrect,
      largestOffset,
      smallestOffset,
      averageOffset,
    };
  }),
});
