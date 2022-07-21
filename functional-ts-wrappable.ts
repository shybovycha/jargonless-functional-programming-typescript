type Func0 <A> = () => A;

type Func <A, B> = (_: A) => B;

interface Wrappable <A> {
    andThen<B>(func: Func<A, B>): Wrappable<B>;

    andThenWrap<B>(func: Func<A, Wrappable<B>>): Wrappable<B>;
}

abstract class Maybe <A> implements Wrappable <A> {
    abstract andThen <B>(func: Func<A, B>): Maybe<B>;

    abstract andThenWrap <B>(func: Func<A, Maybe<B>>): Maybe<B>;

    abstract convert <B>(noneFunc: Func0<B>, someFunc: Func<A, B>): B;

    static option <A>(value: A | null | undefined): Maybe<A> {
        return (!value) ? Maybe.none<A>() : Maybe.some<A>(value);
    }

    static some <A>(value: A): Some<A> {
        return new Some<A>(value);
    }

    static none <A>(): None<A> {
        return new None<A>();
    }
}

class Some <A> extends Maybe <A> {
    constructor(private readonly value: A) {
        super();
    }

    override andThen <B>(func: Func<A, B>): Maybe<B> {
        return new Some(func(this.value));
    }

    override andThenWrap <B>(func: Func<A, Maybe<B>>): Maybe<B> {
        return func(this.value);
    }

    override convert <B>(noneFunc: Func0<B>, someFunc: Func<A, B>): B {
        return someFunc(this.value);
    }
}

class None <A> extends Maybe <A> {
    constructor() {
        super();
    }

    override andThen <B>(_: Func<A, B>): Maybe<B> {
        return new None<B>();
    }

    override andThenWrap <B>(_: Func<A, Maybe<B>>): Maybe<B> {
        return new None<B>();
    }

    override convert <B>(noneFunc: Func0<B>, someFunc: Func<A, B>): B {
        return noneFunc();
    }
}

abstract class Either <E, A> implements Wrappable <A> {
    abstract andThen<B>(func: Func<A, B>): Either<E, B>;

    abstract andThenWrap<B>(func: Func<A, Either<E, B>>): Either<E, B>;

    static left<E, A>(value: E): Either<E, A> {
        return new Left<E, A>(value);
    }

    static right<E, A>(value: A): Either<E, A> {
        return new Right<E, A>(value);
    }
}

class Left <E, A> extends Either<E, A> {
    constructor(private readonly value: E) {
        super();
    }

    andThen<B>(func: Func<A, B>): Either<E, B> {
        return new Left<E, B>(this.value);
    }

    andThenWrap<B>(func: Func<A, Either<E, B>>): Either<E, B> {
        return new Left<E, B>(this.value);
    }
}

class Right <E, A> extends Either<E, A> {
    constructor(private readonly value: A) {
        super();
    }

    andThen<B>(func: Func<A, B>): Either<E, B> {
        return new Right<E, B>(func(this.value));
    }

    andThenWrap<B>(func: Func<A, Either<E, B>>): Either<E, B> {
        return func(this.value);
    }
}

class ExceptionW <A> implements Wrappable <A> {
    constructor(private readonly task: Func0<Wrappable<A>>, private readonly exceptionHandler: Func0<Wrappable<A>>) {}

    andThen<B>(func: Func<A, B>): ExceptionW<B> {
        return new ExceptionW<B>(
            () => this.task().andThen(func),
            () => this.exceptionHandler().andThen(func)
        );
    }

    andThenWrap<B>(func: Func<A, ExceptionW<B>>): ExceptionW<B> {
        return new ExceptionW<B>(
            () => this.task().andThenWrap(func),
            () => this.exceptionHandler().andThenWrap(func)
        );
    }

    unsafeRun(): Wrappable<A> {
        try {
            return this.task();
        } catch {
            return this.exceptionHandler();
        }
    }
}

interface Game {
    name: string;
    rank: string;
}

class PromiseIO <A> implements Wrappable<A> {
    constructor(private readonly task: Func0<Promise<A>>) {
    }

    andThen<B>(func: Func<A, B>): PromiseIO<B> {
        return new PromiseIO<B>(() => this.unsafeRun().then(func));
    }

    andThenWrap<B>(func: Func<A, PromiseIO<B>>): PromiseIO<B> {
        return PromiseIO.join(new PromiseIO<PromiseIO<B>>(() => this.unsafeRun().then(func)));
    }

    unsafeRun(): Promise<A> {
        return this.task();
    }

    static join<A>(m: PromiseIO<PromiseIO<A>>): PromiseIO<A> {
        return new PromiseIO<A>(() => m.unsafeRun().then(p => p.unsafeRun()));
    }
}

class PromiseIOT <A> {
    constructor(private readonly value: PromiseIO<Wrappable<A>>) {
    }

    andThen<B>(func: Func<A, B>): PromiseIOT<B> {
        return new PromiseIOT(this.value.andThen(m => m.andThen(func)));
    }

    andThenWrap<B>(func: Func<A, Wrappable<B>>): PromiseIOT<B> {
        return new PromiseIOT(this.value.andThen(m => m.andThenWrap(func)));
    }

    runPromiseIOT(): PromiseIO<Wrappable<A>> {
        return this.value;
    }
}

const fetchAPIResponse = (): PromiseIO<string> =>
    new PromiseIO(() => fetch(`https://boardgamegeek.com/xmlapi2/hot?type=boardgame`).then(response => response.text()));

const getResponseXML = (response: string): ExceptionW<XMLDocument> =>
    new ExceptionW(
        () => Either<Error, XMLDocument>.right(new DOMParser().parseFromString(response, "text/xml")),
        () => Either<Error, XMLDocument>.left(new Error('Received invalid XML'))
    );

const createGame = (item: Element): Maybe<Game> => {
    const rank = Maybe.option(item.getAttribute('rank'));
    const name = Maybe.option(item.querySelector('name')).andThen(name => name.getAttribute('value'));

    return rank.andThenWrap(r =>
        name.andThen(n => ({ name: n, rank: r } as Game))
    );
};

const extractGames = (doc: XMLDocument): Either<Error, Array<Game>> => {
    const items = Array.from(doc.querySelectorAll('items item'));

    return items.reduce((accEither, item) =>
        accEither.andThenWrap(acc =>
            createGame(item)
                .convert(
                    () => Either<Error, Array<Game>>.left(new Error('bad item')),
                    game => Either<Error, Array<Game>>.right([...acc, game])
                )
        ),
        Either.right<Error, Array<Game>>([])
    );
};

const getRandomTop10Game = (games: Array<Game>): Either<Error, Game> => {
    if (games.length < 10) {
        return Either<Error, Game>.left(new Error('Not enough games'));
    }

    return Either<Error, Game>.right(games[Math.random() * 100 % 10]);
};

const printGame = (game: Game): void => {
    console.log(`#${game.rank}: ${game.name}`);
};


const program = new PromiseIOT(fetchAPIResponse().andThen(response => getResponseXML(response)))
    .andThenWrap(doc => extractGames(doc))
    .andThenWrap(games => getRandomTop10Game(games))
    .andThen(game => printGame(game))
    .runPromiseIOT()
    .unsafeRun();
