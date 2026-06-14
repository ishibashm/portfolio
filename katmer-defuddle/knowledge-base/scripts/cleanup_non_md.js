"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1];
          return t[1];
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g = Object.create(
        (typeof Iterator === "function" ? Iterator : Object).prototype,
      );
    return (
      (g.next = verb(0)),
      (g["throw"] = verb(1)),
      (g["return"] = verb(2)),
      typeof Symbol === "function" &&
        (g[Symbol.iterator] = function () {
          return this;
        }),
      g
    );
    function verb(n) {
      return function (v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f) throw new TypeError("Generator is already executing.");
      while ((g && ((g = 0), op[0] && (_ = 0)), _))
        try {
          if (
            ((f = 1),
            y &&
              (t =
                op[0] & 2
                  ? y["return"]
                  : op[0]
                    ? y["throw"] || ((t = y["return"]) && t.call(y), 0)
                    : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t;
          if (((y = 0), t)) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0:
            case 1:
              t = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (
                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                (op[0] === 6 || op[0] === 2)
              ) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1];
                t = op;
                break;
              }
              if (t && _.label < t[2]) {
                _.label = t[2];
                _.ops.push(op);
                break;
              }
              if (t[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t = 0;
        }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  };
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var prisma = new client_1.PrismaClient();
function main() {
  return __awaiter(this, void 0, void 0, function () {
    var allDocs,
      deletedCount,
      _i,
      allDocs_1,
      doc,
      shouldDelete,
      reason,
      lowerTitle,
      contentPrefix;
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          console.log("Scanning database for non-markdown files...");
          return [
            4 /*yield*/,
            prisma.knowledgeDocument.findMany({
              select: { id: true, title: true, content: true },
            }),
          ];
        case 1:
          allDocs = _a.sent();
          deletedCount = 0;
          ((_i = 0), (allDocs_1 = allDocs));
          _a.label = 2;
        case 2:
          if (!(_i < allDocs_1.length)) return [3 /*break*/, 5];
          doc = allDocs_1[_i];
          shouldDelete = false;
          reason = "";
          lowerTitle = doc.title.toLowerCase();
          if (
            lowerTitle.endsWith(".png") ||
            lowerTitle.endsWith(".jpg") ||
            lowerTitle.endsWith(".jpeg") ||
            lowerTitle.endsWith(".pdf") ||
            lowerTitle.endsWith(".webarchive") ||
            lowerTitle.endsWith(".gif")
          ) {
            shouldDelete = true;
            reason = "File extension in title";
          }
          contentPrefix = doc.content.substring(0, 10);
          if (
            contentPrefix.includes("PNG") ||
            contentPrefix.includes("PNG") ||
            doc.content.startsWith("\x89PNG")
          ) {
            shouldDelete = true;
            reason = "PNG binary signature";
          }
          if (contentPrefix.startsWith("%PDF")) {
            shouldDelete = true;
            reason = "PDF binary signature";
          }
          if (contentPrefix.startsWith("bplist")) {
            shouldDelete = true;
            reason = "Apple binary plist (webarchive) signature";
          }
          // 3. Check JSON (if it's just raw JSON and not a markdown chat export)
          // Some JSONs start with { or [
          if (
            !shouldDelete &&
            (doc.content.trim().startsWith("{") ||
              doc.content.trim().startsWith("["))
          ) {
            // Check if it's purely JSON (could be a valid md file that just starts with JSON, but usually unlikely)
            try {
              JSON.parse(doc.content);
              // If it parses as JSON perfectly, it's a JSON file, not MD.
              shouldDelete = true;
              reason = "Raw JSON content";
            } catch (e) {
              // Not pure JSON, leave it.
            }
          }
          if (!shouldDelete) return [3 /*break*/, 4];
          console.log(
            "Deleting ID: "
              .concat(doc.id, " | Title: ")
              .concat(doc.title, " | Reason: ")
              .concat(reason),
          );
          return [
            4 /*yield*/,
            prisma.knowledgeDocument.delete({ where: { id: doc.id } }),
          ];
        case 3:
          _a.sent();
          deletedCount++;
          _a.label = 4;
        case 4:
          _i++;
          return [3 /*break*/, 2];
        case 5:
          console.log(
            "\nCleanup complete. Deleted ".concat(
              deletedCount,
              " non-markdown records.",
            ),
          );
          return [2 /*return*/];
      }
    });
  });
}
main()
  .catch(console.error)
  .finally(function () {
    return prisma.$disconnect();
  });
