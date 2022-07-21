type Func0 <A> = () => A;

type Func <A, B> = (_: A) => B;

abstract class Monad <A> {
    abstract map<B>(func: Func<A, B>): Monad<B>;

    abstract flatMap<B>(func: Func<A, Monad<B>>): Monad<B>;
}

abstract class Maybe<A> extends Monad<A> {
    abstract map<B>(_: Func<A, B>): Maybe<B>;

    abstract flatMap<B>(_: Func<A, Maybe<B>>): Maybe<B>;

    abstract bimap<B>(nothingFunc: Func0<B>, justFunc: Func<A, B>): B;

    static maybe<A>(value: A | undefined | null): Maybe<A> {
        return (!value) ? new Nothing<A>() : new Just<A>(value);
    }

    static just<A>(value: A): Maybe<A> {
        return new Just<A>(value);
    }

    static nothing<A>(): Maybe<A> {
        return new Nothing<A>();
    }

    static join<A>(maybe: Maybe<Maybe<A>>): Maybe<A> {
        return maybe.flatMap(x => x);
    }
}

class Just<A> extends Maybe<A> {
    constructor(private readonly value: A) {
        super();
    }

    override map<B>(func: Func<A, B>): Maybe<B> {
        return new Just<B>(func(this.value));
    }

    override flatMap<B>(func: Func<A, Maybe<B>>): Maybe<B> {
        return func(this.value);
    }

    override bimap<B>(_: Func0<B>, justFunc: Func<A, B>): B {
        return justFunc(this.value);
    }
}

class Nothing<A> extends Maybe<A> {
    constructor() {
        super();
    }

    override map<B>(_: Func<A, B>): Maybe<B> {
        return new Nothing<B>();
    }

    override flatMap<B>(_: Func<A, Maybe<B>>): Maybe<B> {
        return new Nothing<B>();
    }

    override bimap<B>(nothingFunc: Func0<B>, _: Func<A, B>): B {
        return nothingFunc();
    }
}

abstract class Either<E, A> extends Monad<A> {
    abstract map<B>(_: Func<A, B>): Either<E, B>;

    abstract flatMap<B>(_: Func<A, Either<E, B>>): Either<E, B>;

    abstract bimap<B>(leftFunc: Func<E, B>, rightFunc: Func<A, B>): B;

    static left<E, A>(value: E): Either<E, A> {
        return new Left<E, A>(value);
    }

    static right<E, A>(value: A): Either<E, A> {
        return new Right<E, A>(value);
    }
}

class Right<E, A> extends Either<E, A> {
    constructor(private readonly value: A) {
        super();
    }

    override map<B>(func: Func<A, B>): Either<E, B> {
        return new Right<E, B>(func(this.value));
    }

    override flatMap<B>(func: Func<A, Either<E, B>>): Either<E, B> {
        return func(this.value);
    }

    override bimap<B>(_: Func<E, B>, rightFunc: Func<A, B>): B {
        return rightFunc(this.value);
    }
}

class Left<E, A> extends Either<E, A> {
    constructor(private readonly value: E) {
        super();
    }

    override map<B>(_: Func<A, B>): Either<E, B> {
        return new Left<E, B>(this.value);
    }

    override flatMap<B>(_: Func<A, Either<E, B>>): Either<E, B> {
        return new Left<E, B>(this.value);
    }

    override bimap<B>(leftFunc: Func<E, B>, _: Func<A, B>): B {
        return leftFunc(this.value);
    }
}

class IO<A> extends Monad<A> {
    constructor(private readonly task: Func0<A>) {
        super();
    }

    map<B>(func: Func<A, B>): IO<B> {
        return new IO<B>(() => func(this.unsafeRun()));
    }

    flatMap<B>(func: Func<A, IO<B>>): IO<B> {
        return IO.join(new IO<IO<B>>(() => func(this.unsafeRun())));
    }

    unsafeRun(): A {
        return this.task();
    }

    static join<A>(m: IO<IO<A>>): IO<A> {
        return new IO<A>(() => m.unsafeRun().unsafeRun());
    }
}

// ---

class PromiseIO <A> implements Monad<A> {
    constructor(private readonly task: Func0<Promise<A>>) {
    }

    map<B>(func: Func<A, B>): PromiseIO<B> {
        return new PromiseIO<B>(() => this.unsafeRun().then(func));
    }

    flatMap<B>(func: Func<A, PromiseIO<B>>): PromiseIO<B> {
        return PromiseIO.join(new PromiseIO<PromiseIO<B>>(() => this.unsafeRun().then(func)));
    }

    unsafeRun(): Promise<A> {
        return this.task();
    }

    static join<A>(m: PromiseIO<PromiseIO<A>>): PromiseIO<A> {
        return new PromiseIO<A>(() => m.unsafeRun().then(p => p.unsafeRun()));
    }
}

// ---

class PromiseIOT <A> {
    constructor(private readonly value: PromiseIO<Monad<A>>) {
    }

    map<B>(func: Func<A, B>): PromiseIOT<B> {
        return new PromiseIOT(this.value.map(m => m.map(func)));
    }

    flatMap<B>(func: Func<A, Monad<B>>): PromiseIOT<B> {
        return new PromiseIOT(this.value.map(m => m.flatMap(func)));
    }

    runPromiseIOT(): PromiseIO<Monad<A>> {
        return this.value;
    }
}

// ---

interface Game {
    name: string;
    rank: string;
}

const createGame = (item: Element): Maybe<Game> => {
    const rank = Maybe.maybe(item.getAttribute('rank'));
    const name = Maybe.maybe(item.querySelector('name')).map(name => name.getAttribute('value'));

    return rank.flatMap(r =>
        name.map(n => ({ name: n, rank: r } as Game))
    );
};

const getResponseXML = (response: string): Either<Error, XMLDocument> => {
    try {
        return Either<Error, XMLDocument>.right(new DOMParser().parseFromString(response, "text/xml"));
    } catch {
        return Either<Error, XMLDocument>.left(new Error('Received invalid XML'));
    }
};

const extractGames = (doc: XMLDocument): Either<Error, Array<Game>> => {
    const items = Array.from(doc.querySelectorAll('items item'));

    return items.reduce((accEither, item) =>
        accEither.flatMap(acc =>
            createGame(item)
                .bimap(
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

const fetchAPIResponse = (): PromiseIO<Either<Error, string>> =>
    new PromiseIO(() => fetch(`https://boardgamegeek.com/xmlapi2/hot?type=boardgame`).then(response => response.text()))
        .map(response => Either<Error, string>.right(response));

const program = new PromiseIOT(fetchAPIResponse())
    .flatMap(r => getResponseXML(r))
    .flatMap(doc => extractGames(doc))
    .flatMap(games => getRandomTop10Game(games))
    .map(game => printGame(game))
    .runPromiseIOT()
    .unsafeRun();
