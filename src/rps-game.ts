import { Event } from "@leancloud/play";
import d = require("debug");
import _ = require("lodash");
import { tap } from "rxjs/operators";
import AutoStartGame from "./auto-start-game";
import { GameEvent } from "./game";
import { listen } from "./utils";

const debug = d("MM:RPS");

// [✊, ✌️, ✋] wins [✌️, ✋, ✊]
const wins = [1, 2, 0];

/**
 * 石头剪刀布游戏
 */
export default class RPSGame extends AutoStartGame {
  public reservationHoldTime = 12000;

  public async start(): Promise<void> {
    // 向客户端广播游戏开始事件
    this.broadcast("game-start");
    // 等待所有玩家都已做出选择的时刻
    const playPromise = Promise.all(this.players.map((player) =>
        this.takeFirst("play", player)
          // 向其他玩家转发出牌动作，但是隐藏具体的 choice
          .pipe(tap(_.bind(this.forwardToTheRests, this, _, () => ({}))))
          .toPromise(),
      ));
    // 监听 player 离开游戏事件
    const playerLeftPromise = listen(this.masterClient, Event.PLAYER_ROOM_LEFT);
    // 取上面两个事件先发生的那个作为结果
    const result = await Promise.race([playPromise, playerLeftPromise]);
    debug(result);
    let choices;
    let winner;
    if (Array.isArray(result)) {
      // 如果都已做出选择，比较得到赢家
      choices = result.map(({ eventData }) => eventData.index as number);
      winner = this.getWinner(choices);
    } else {
      // 如果某玩家离开了游戏，另一位玩家胜利
      winner = this.players.find((player) => player !== result.leftPlayer);
    }
    // 游戏结束
    // 向客户端广播游戏结果
    this.broadcast("game-over", {
      choices,
      winnerId: winner ? winner.userId : null,
    });
    debug("RPS end");
    console.log("before end memory:", process.memoryUsage());
    // 派发游戏结束事件通知 Reception 回收房间
    // 重要：必须保证所有可能的游戏逻辑最后都会派发该事件。没有派发该事件的房间会一直存在。
    this.emit(GameEvent.END);
  }

  /**
   * 根据玩家的选择计算赢家
   * @return 返回胜利的 Player，或者 null 表示平局
   */
  private getWinner([player1Choice, player2Choice]: number[]) {
    if (player1Choice === player2Choice) { return null; }
    if (wins[player1Choice] === player2Choice) { return this.players[0]; }
    return this.players[1];
  }
}
